/**
 * Fastify type-provider-zod emitter for openapi-server.
 *
 * Replaces the hand-rolled Fastify branch in router.ts with a dedicated module
 * that uses fastify-type-provider-zod for request validation and type inference.
 *
 * Key design points (decided, not re-litigated):
 * - withTypeProvider<ZodTypeProvider>() + setValidatorCompiler + setSerializerCompiler registered once
 * - Single setErrorHandler maps HttpError to its .status code (no per-route try/catch)
 * - Per route: schema.body, schema.params, schema.querystring, schema.headers, schema.response, config.operationId
 * - preValidation hook for deepObject and delimiter-style query params (emitted per-route, not globally)
 * - Cookie params still use manual _ckv safeParse (schema.cookie requires @fastify/cookie, out of scope)
 * - No per-route generic type arguments; req.body/req.query/req.params infer from schemas
 * - No (reply as FastifyReply) casts
 */
import type { OpenAPIV3_1 } from 'openapi-types'
import type { GeneratedFile } from 'openapi-zod-ts'
import {
  SUPPORTED_METHODS,
  type SupportedMethod,
  isRef,
  refToName,
  extractPathParamsFromPath,
  resolveParam,
  deriveServiceName,
  deriveMethodName,
  normalizeParamName,
  schemaToTsType,
  type QueryParam,
  getQueryParams,
  type BodyInfo,
  getBodyInfo,
} from './shared.js'

type OperationObject = OpenAPIV3_1.OperationObject
type ReferenceObject = OpenAPIV3_1.ReferenceObject
type ParameterObject = OpenAPIV3_1.ParameterObject
type ResponseObject = OpenAPIV3_1.ResponseObject

// ── Local types (not shared with router.ts to avoid circular deps) ─────────────

interface HeaderParam {
  rawName: string
  required: boolean
  enum?: string[]
  minLength?: number
  maxLength?: number
  pattern?: string
}

interface CookieParam {
  rawName: string
  required: boolean
  enum?: string[]
  minLength?: number
  maxLength?: number
  pattern?: string
}

interface PathParamValidation {
  rawName: string
  zodExpr: string
}

interface ResponseStatus {
  status: number
  isVoid: boolean
  responseContentType: 'application/json' | 'text/plain' | 'application/octet-stream'
  isMultiStatus?: boolean
}

interface RouteOperation {
  methodName: string
  httpMethod: SupportedMethod
  path: string
  honoPath: string
  pathParams: string[]
  queryParams: QueryParam[]
  headerParams: HeaderParam[]
  cookieParams: CookieParam[]
  bodyInfo: BodyInfo | undefined
  responseStatus: ResponseStatus
  responseTypeName?: string
  responseIsArray?: boolean
  /** Raw OpenAPI operation object for schema.params resolution. */
  rawOperation: OperationObject
}

interface RouterOptions {
  schemaNames?: Set<string>
  schemaImportPath?: string
  contextType?: string
}

// ── Shared path conversion ────────────────────────────────────────────────────

function toFastifyPath(openapiPath: string): string {
  return openapiPath.replace(/\{([^}]+)\}/g, ':$1')
}

// ── Header param helpers ──────────────────────────────────────────────────────

function getHeaderParams(operation: OperationObject, spec: OpenAPIV3_1.Document): HeaderParam[] {
  const parameters = operation.parameters as (ParameterObject | ReferenceObject)[] | undefined
  if (parameters === undefined) return []
  const result: HeaderParam[] = []
  for (const p of parameters) {
    const resolved = resolveParam(p, spec)
    if (resolved === undefined || resolved.in !== 'header') continue
    const param: HeaderParam = { rawName: resolved.name, required: resolved.required === true }
    const schema = resolved.schema as OpenAPIV3_1.SchemaObject | undefined
    if (schema !== undefined && !isRef(schema)) {
      const s = schema as OpenAPIV3_1.SchemaObject
      if (Array.isArray(s.enum)) param.enum = s.enum as string[]
      if (typeof s.minLength === 'number') param.minLength = s.minLength
      if (typeof s.maxLength === 'number') param.maxLength = s.maxLength
      if (typeof s.pattern === 'string') param.pattern = s.pattern
    }
    result.push(param)
  }
  return result
}

// ── Cookie param helpers ──────────────────────────────────────────────────────

function getCookieParams(operation: OperationObject, spec: OpenAPIV3_1.Document): CookieParam[] {
  const parameters = operation.parameters as (ParameterObject | ReferenceObject)[] | undefined
  if (parameters === undefined) return []
  const result: CookieParam[] = []
  for (const p of parameters) {
    const resolved = resolveParam(p, spec)
    if (resolved === undefined || resolved.in !== 'cookie') continue
    const param: CookieParam = { rawName: resolved.name, required: resolved.required === true }
    const schema = resolved.schema as OpenAPIV3_1.SchemaObject | undefined
    if (schema !== undefined && !isRef(schema)) {
      const s = schema as OpenAPIV3_1.SchemaObject
      if (Array.isArray(s.enum)) param.enum = s.enum as string[]
      if (typeof s.minLength === 'number') param.minLength = s.minLength
      if (typeof s.maxLength === 'number') param.maxLength = s.maxLength
      if (typeof s.pattern === 'string') param.pattern = s.pattern
    }
    result.push(param)
  }
  return result
}

// ── Response status helpers ───────────────────────────────────────────────────

function response200IsVoid(resp: ResponseObject | ReferenceObject): boolean {
  if (isRef(resp)) return false
  const r = resp as ResponseObject
  const content = r.content as Record<string, unknown> | undefined
  return content === undefined || Object.keys(content).length === 0
}

function detectResponseContentType(
  resp: ResponseObject | ReferenceObject
): 'application/json' | 'text/plain' | 'application/octet-stream' {
  if (isRef(resp)) return 'application/json'
  const r = resp as ResponseObject
  const content = r.content as Record<string, unknown> | undefined
  if (content === undefined) return 'application/json'
  if ('text/plain' in content) return 'text/plain'
  if ('application/octet-stream' in content) return 'application/octet-stream'
  return 'application/json'
}

function getResponseStatus(
  operation: OperationObject,
  httpMethod: SupportedMethod
): ResponseStatus {
  const responses = operation.responses as
    | Record<string, ResponseObject | ReferenceObject>
    | undefined

  if (responses === undefined) {
    return httpMethod === 'delete'
      ? { status: 204, isVoid: true, responseContentType: 'application/json' }
      : { status: 200, isVoid: false, responseContentType: 'application/json' }
  }

  const contentfulTwoxxKeys = Object.keys(responses)
    .filter((k) => /^2\d\d$/.test(k) && k !== '204')
    .sort()
  if (contentfulTwoxxKeys.length > 1) {
    return {
      status: 200,
      isVoid: false,
      responseContentType: 'application/json',
      isMultiStatus: true,
    }
  }

  if (responses['201'] !== undefined) {
    return {
      status: 201,
      isVoid: false,
      responseContentType: detectResponseContentType(responses['201']),
    }
  }
  if (responses['204'] !== undefined) {
    return { status: 204, isVoid: true, responseContentType: 'application/json' }
  }
  if (responses['200'] !== undefined) {
    if (response200IsVoid(responses['200'])) {
      return { status: 204, isVoid: true, responseContentType: 'application/json' }
    }
    return {
      status: 200,
      isVoid: false,
      responseContentType: detectResponseContentType(responses['200']),
    }
  }

  const twoxxKeys = Object.keys(responses).filter(
    (k) => /^2\d\d$/.test(k) && k !== '200' && k !== '201' && k !== '204'
  )
  if (twoxxKeys.length === 1) {
    const code = parseInt(twoxxKeys[0], 10)
    const resp = responses[twoxxKeys[0]]
    const isVoid = isRef(resp)
      ? false
      : (() => {
          const r = resp as ResponseObject
          const content = r.content as Record<string, unknown> | undefined
          return content === undefined || Object.keys(content).length === 0
        })()
    return { status: code, isVoid, responseContentType: detectResponseContentType(resp) }
  }

  return httpMethod === 'delete'
    ? { status: 204, isVoid: true, responseContentType: 'application/json' }
    : { status: 200, isVoid: false, responseContentType: 'application/json' }
}

function getResponseTypeName(
  operation: OperationObject
): { typeName: string; isArray: boolean } | undefined {
  const responses = operation.responses as
    | Record<string, ResponseObject | ReferenceObject>
    | undefined
  if (responses === undefined) return undefined

  const priority = [
    '200',
    '201',
    ...Object.keys(responses).filter(
      (k) => /^2\d\d$/.test(k) && k !== '200' && k !== '201' && k !== '204'
    ),
  ]

  for (const code of priority) {
    const response = responses[code]
    if (response === undefined || isRef(response)) continue
    const resp = response as ResponseObject
    const content = resp.content as
      | Record<string, { schema?: OpenAPIV3_1.SchemaObject | ReferenceObject }>
      | undefined
    if (content === undefined) continue
    const jsonContent = content['application/json']
    if (jsonContent === undefined || jsonContent.schema === undefined) continue
    const schema = jsonContent.schema
    if (isRef(schema)) {
      return { typeName: refToName((schema as ReferenceObject).$ref), isArray: false }
    }
    const s = schema as OpenAPIV3_1.SchemaObject
    if (s.type === 'array' && s.items !== undefined && isRef(s.items)) {
      return { typeName: refToName((s.items as ReferenceObject).$ref), isArray: true }
    }
  }

  return undefined
}

// ── Operation collection ──────────────────────────────────────────────────────

function collectOperations(spec: OpenAPIV3_1.Document): RouteOperation[] {
  const paths = spec.paths as Record<string, Record<string, OperationObject>> | undefined
  if (paths === undefined) return []

  const operations: RouteOperation[] = []

  for (const [path, pathItem] of Object.entries(paths)) {
    for (const method of SUPPORTED_METHODS) {
      const operation = pathItem[method] as OperationObject | undefined
      if (operation === undefined) continue

      const methodName = deriveMethodName(operation.operationId, method, path)
      const pathParams = extractPathParamsFromPath(path)
      const queryParams = getQueryParams(operation, spec)
      const headerParams = getHeaderParams(operation, spec)
      const cookieParams = getCookieParams(operation, spec)
      const bodyInfo = getBodyInfo(operation)
      const responseStatus = getResponseStatus(operation, method)
      const responseTypeInfo = getResponseTypeName(operation)

      operations.push({
        methodName,
        httpMethod: method,
        path,
        honoPath: toFastifyPath(path),
        pathParams,
        queryParams,
        headerParams,
        cookieParams,
        bodyInfo,
        responseStatus,
        responseTypeName: responseTypeInfo?.typeName,
        responseIsArray: responseTypeInfo?.isArray,
        rawOperation: operation,
      })
    }
  }

  return operations
}

// ── Schema name collection ────────────────────────────────────────────────────

function collectSortedBodyTypes(operations: RouteOperation[]): string[] {
  const bodyTypes = new Set<string>()
  for (const op of operations) {
    if (op.bodyInfo?.typeName !== undefined && !op.bodyInfo.isSynthesized) {
      // Only include types that don't have a corresponding schema (no schema.body wiring).
      // If schema.body IS set, the type provider infers the type directly from the schema.
      // We still need the type import for cast-based body usage (no schema available).
      bodyTypes.add(op.bodyInfo.typeName)
    }
  }
  return Array.from(bodyTypes).sort()
}

function collectUsedSchemaNames(
  operations: RouteOperation[],
  schemaNames: Set<string>
): Set<string> {
  const used = new Set<string>()
  for (const op of operations) {
    const typeName = op.bodyInfo?.typeName
    if (typeName === undefined) continue
    const schemaName = `${typeName}Schema`
    if (schemaNames.has(schemaName)) used.add(schemaName)
  }
  return used
}

function collectUsedResponseSchemaNames(
  operations: RouteOperation[],
  schemaNames: Set<string>
): Set<string> {
  const used = new Set<string>()
  for (const op of operations) {
    if (op.responseTypeName === undefined) continue
    if (op.responseStatus.isMultiStatus === true) continue
    const schemaName = `${op.responseTypeName}Schema`
    if (schemaNames.has(schemaName)) used.add(schemaName)
  }
  return used
}

// ── Zod expression builders ───────────────────────────────────────────────────

function delimiterChar(style: 'csv' | 'ssv' | 'psv'): string {
  if (style === 'ssv') return ' '
  if (style === 'psv') return '|'
  return ','
}

/** Append .min/.max/.regex string constraints in a stable order. */
function stringConstraintSuffix(p: {
  minLength?: number
  maxLength?: number
  pattern?: string
}): string {
  let s = ''
  if (p.minLength !== undefined) s += `.min(${p.minLength})`
  if (p.maxLength !== undefined) s += `.max(${p.maxLength})`
  if (p.pattern !== undefined) s += `.regex(/${p.pattern}/)`
  return s
}

/** Append .min/.max/.gt/.lt numeric constraints in a stable order. */
function numberConstraintSuffix(p: {
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
}): string {
  let s = ''
  if (p.minimum !== undefined) s += `.min(${p.minimum})`
  if (p.maximum !== undefined) s += `.max(${p.maximum})`
  if (p.exclusiveMinimum !== undefined) s += `.gt(${p.exclusiveMinimum})`
  if (p.exclusiveMaximum !== undefined) s += `.lt(${p.exclusiveMaximum})`
  return s
}

/** z.enum([...]) when an enum is present, else z.string(), plus string constraints. */
function enumOrStringExpr(p: {
  enum?: string[]
  minLength?: number
  maxLength?: number
  pattern?: string
}): string {
  const base =
    p.enum !== undefined && p.enum.length > 0
      ? `z.enum([${p.enum.map((v) => JSON.stringify(v)).join(', ')}])`
      : 'z.string()'
  return base + stringConstraintSuffix(p)
}

/** Wrap a Zod expression in .optional() unless the param is required. */
function withOptional(base: string, required: boolean): string {
  return required ? base : `${base}.optional()`
}

function queryParamBaseExpr(param: QueryParam): string {
  if (param.delimiterStyle !== undefined) return 'z.array(z.string())'
  if (param.isDeepObject === true && param.deepObjectProperties !== undefined) {
    const propFields = param.deepObjectProperties.map((p) => {
      const coerced = p.tsType === 'number' ? 'z.coerce.number()' : 'z.string()'
      return `${p.key}: ${coerced}.optional()`
    })
    return `z.object({ ${propFields.join(', ')} })`
  }
  if (param.tsType === 'number') return `z.coerce.number()${numberConstraintSuffix(param)}`
  if (param.tsType === 'boolean') return 'z.boolean()'
  return enumOrStringExpr(param)
}

function queryParamZodExpr(param: QueryParam): string {
  return withOptional(queryParamBaseExpr(param), param.required)
}

function headerParamZodExpr(param: HeaderParam): string {
  return withOptional(enumOrStringExpr(param), param.required)
}

function cookieParamZodExpr(param: CookieParam): string {
  return withOptional(enumOrStringExpr(param), param.required)
}

// ── Path param schema builder ─────────────────────────────────────────────────

function pathParamSchemaExpr(resolved: ParameterObject): string {
  const schema = resolved.schema as OpenAPIV3_1.SchemaObject | undefined
  if (schema === undefined || isRef(schema)) return 'z.string()'
  const s = schema as OpenAPIV3_1.SchemaObject & {
    exclusiveMinimum?: number
    exclusiveMaximum?: number
  }
  if (s.type === 'integer' || s.type === 'number') {
    // Path params are always HTTP string segments. Keeping the type as string avoids
    // mismatches with the generated service interface (which always types path params as string).
    return 'z.string()'
  }
  if (s.type !== 'string') return 'z.string()'
  const format = s.format as string | undefined
  if (format === 'uuid') return 'z.string().uuid()'
  if (format === 'email') return 'z.string().email()'
  if (format === 'uri' || format === 'url') return 'z.string().url()'
  if (format === 'date-time') return 'z.string().datetime()'
  return 'z.string()'
}

function buildParamsSchemaExpr(op: RouteOperation, spec: OpenAPIV3_1.Document): string | undefined {
  if (op.pathParams.length === 0) return undefined

  const paramByName = new Map<string, ParameterObject>()
  const parameters = op.rawOperation.parameters as (ParameterObject | ReferenceObject)[] | undefined
  if (parameters !== undefined) {
    for (const p of parameters) {
      const resolved = resolveParam(p, spec)
      if (resolved !== undefined && resolved.in === 'path') {
        paramByName.set(resolved.name, resolved)
      }
    }
  }

  const fields = op.pathParams
    .map((rawName) => {
      const resolved = paramByName.get(rawName)
      const zodExpr = resolved !== undefined ? pathParamSchemaExpr(resolved) : 'z.string()'
      const key = /[^a-zA-Z0-9_$]/.test(rawName) ? JSON.stringify(rawName) : rawName
      return `${key}: ${zodExpr}`
    })
    .join(', ')
  return `z.object({ ${fields} })`
}

// ── preValidation hook builder ────────────────────────────────────────────────

/**
 * Build preValidation hook lines for routes with deepObject or delimiter-style query params.
 * The hook mutates (req as any).query before the validatorCompiler runs, reshaping flat
 * bracket-notation keys into nested objects and splitting delimited strings into arrays.
 * Returns undefined when no complex query params are present.
 */
function buildPreValidationLines(queryParams: QueryParam[]): string[] | undefined {
  const hasComplex = queryParams.some(
    (q) => q.isDeepObject === true || q.delimiterStyle !== undefined
  )
  if (!hasComplex) return undefined

  const lines: string[] = []
  lines.push(`      const _dq = req.query as unknown as Record<string, string | undefined>`)

  const reshapedFields: string[] = []
  for (const q of queryParams) {
    if (q.isDeepObject === true) {
      const prefixLen = q.rawName.length + 1
      const bracketPrefix = q.rawName + '['
      reshapedFields.push(
        `        ${q.name}: Object.fromEntries(Object.entries(_dq).filter(([k]) => k.startsWith(${JSON.stringify(bracketPrefix)}) && k.endsWith(']')).map(([k, v]) => [k.slice(${prefixLen}, -1), v]))`
      )
    } else if (q.delimiterStyle !== undefined) {
      const delim = JSON.stringify(delimiterChar(q.delimiterStyle))
      reshapedFields.push(
        `        ${q.name}: typeof _dq[${JSON.stringify(q.rawName)}] === 'string' ? _dq[${JSON.stringify(q.rawName)}]!.split(${delim}) : undefined`
      )
    } else {
      reshapedFields.push(`        ${q.name}: _dq[${JSON.stringify(q.rawName)}]`)
    }
  }

  lines.push(`      ;(req as any).query = {`)
  lines.push(reshapedFields.join(',\n'))
  lines.push(`      }`)
  return lines
}

// ── Route options builder ─────────────────────────────────────────────────────

function buildRouteOptions(
  schemaParts: string[],
  preValidationLines: string[] | undefined,
  methodName: string
): string {
  const parts: string[] = []
  if (schemaParts.length > 0) {
    parts.push(`schema: { ${schemaParts.join(', ')} }`)
  }
  if (preValidationLines !== undefined) {
    parts.push(`preValidation: async (req) => {\n${preValidationLines.join('\n')}\n    }`)
  }
  parts.push(`config: { operationId: '${methodName}' }`)
  return `{ ${parts.join(', ')} }`
}

// ── HttpError class lines ─────────────────────────────────────────────────────

function httpErrorClassLines(): string[] {
  return [
    'export class HttpError extends Error {',
    '  constructor(public readonly status: number, message: string) {',
    '    super(message)',
    "    this.name = 'HttpError'",
    '  }',
    '}',
  ]
}

// ── Route handler builder ─────────────────────────────────────────────────────

// fallow-ignore-next-line complexity
function buildFastifyTypeProviderHandler(
  op: RouteOperation,
  indent: string,
  spec: OpenAPIV3_1.Document,
  schemaNames?: Set<string>,
  contextType?: string
): string {
  const lines: string[] = []
  const inner = `${indent}  `

  // ── Body schema ───────────────────────────────────────────────────────────
  let bodySchemaExpr: string | undefined
  if (op.bodyInfo !== undefined && op.bodyInfo.typeName !== undefined) {
    const schemaName = `${op.bodyInfo.typeName}Schema`
    if (schemaNames !== undefined && schemaNames.has(schemaName)) {
      bodySchemaExpr = schemaName
    }
  }

  // ── Params schema (always includes all path params) ───────────────────────
  const paramsSchemaExpr = buildParamsSchemaExpr(op, spec)

  // ── Querystring schema ────────────────────────────────────────────────────
  // All query params are covered. deepObject/delimiter params use reshaped Zod types
  // (z.object/z.array) that match the shape after preValidation mutates req.query.
  let querystringSchemaExpr: string | undefined
  if (op.queryParams.length > 0) {
    const fields = op.queryParams.map((q) => `${q.name}: ${queryParamZodExpr(q)}`).join(', ')
    querystringSchemaExpr = `z.object({ ${fields} })`
  }

  // ── Headers schema ────────────────────────────────────────────────────────
  // Header keys MUST be lowercase in schema.headers: Fastify normalizes header names to lowercase.
  let headersSchemaExpr: string | undefined
  if (op.headerParams.length > 0) {
    const fields = op.headerParams
      .map((h) => {
        const key = JSON.stringify(h.rawName.toLowerCase())
        const expr = headerParamZodExpr(h)
        return `${key}: ${expr}`
      })
      .join(', ')
    headersSchemaExpr = `z.object({ ${fields} })`
  }

  // ── Response schema (#308) ────────────────────────────────────────────────
  let responseSchemaExpr: string | undefined
  if (
    schemaNames !== undefined &&
    op.responseTypeName !== undefined &&
    op.responseStatus.isMultiStatus !== true &&
    !op.responseStatus.isVoid
  ) {
    const schemaName = `${op.responseTypeName}Schema`
    if (schemaNames.has(schemaName)) {
      responseSchemaExpr = op.responseIsArray === true ? `z.array(${schemaName})` : schemaName
    }
  }

  // ── preValidation hook for complex query params ───────────────────────────
  const preValidationLines = buildPreValidationLines(op.queryParams)

  // ── Assemble schema block ─────────────────────────────────────────────────
  const schemaParts: string[] = []
  if (bodySchemaExpr !== undefined) schemaParts.push(`body: ${bodySchemaExpr}`)
  if (paramsSchemaExpr !== undefined) schemaParts.push(`params: ${paramsSchemaExpr}`)
  if (querystringSchemaExpr !== undefined) schemaParts.push(`querystring: ${querystringSchemaExpr}`)
  if (headersSchemaExpr !== undefined) schemaParts.push(`headers: ${headersSchemaExpr}`)
  if (responseSchemaExpr !== undefined) {
    schemaParts.push(`response: { ${op.responseStatus.status}: ${responseSchemaExpr} }`)
  }

  const routeOpts = buildRouteOptions(schemaParts, preValidationLines, op.methodName)
  lines.push(
    `${indent}_app.${op.httpMethod}(${JSON.stringify(op.honoPath)}, ${routeOpts}, async (req, reply) => {`
  )

  // ── Cookie validation (manual _ckv: type provider does not handle cookies) ─
  if (op.cookieParams.length > 0) {
    const fieldIndent = `${indent}    `
    const schemaFields = op.cookieParams
      .map((ck) => `${fieldIndent}${JSON.stringify(ck.rawName)}: ${cookieParamZodExpr(ck)}`)
      .join(',\n')
    const rawFields = op.cookieParams
      .map(
        (ck) =>
          `${fieldIndent}${JSON.stringify(ck.rawName)}: req.cookies[${JSON.stringify(ck.rawName)}]`
      )
      .join(',\n')
    lines.push(`${inner}// Validate request cookies: returns 422 with Zod issues on failure`)
    lines.push(`${inner}const _ckv = z.object({`)
    lines.push(schemaFields)
    lines.push(`${inner}}).safeParse({`)
    lines.push(rawFields)
    lines.push(`${inner}})`)
    lines.push(`${inner}if (!_ckv.success) {`)
    lines.push(
      `${inner}  return reply.status(422).send({ error: 'Invalid request cookies', issues: _ckv.error.issues })`
    )
    lines.push(`${inner}}`)
  }

  // ── Service call args ─────────────────────────────────────────────────────
  const serviceArgs: string[] = []

  // Path params: typed via schema.params (ZodTypeProvider infers the shape).
  for (const rawName of op.pathParams) {
    if (/[^a-zA-Z0-9_$]/.test(rawName)) {
      serviceArgs.push(`req.params[${JSON.stringify(rawName)}]`)
    } else {
      serviceArgs.push(`req.params.${rawName}`)
    }
  }

  // Body: the validatorCompiler validates req.body at runtime before the handler runs, and the
  // ZodTypeProvider infers req.body as the schema's output type. That type usually matches the
  // service interface's parameter type, but can diverge structurally for some constructs (a
  // passthrough object adds an index signature; loose/synthesized shapes infer differently). We
  // therefore assert the body to the service's named model type where one exists (specific and
  // safe, since validation already happened), and fall back to `any` only for synthesized/inline
  // shapes that have no nameable type.
  if (op.bodyInfo !== undefined) {
    if (op.bodyInfo.typeName !== undefined && !op.bodyInfo.isSynthesized) {
      serviceArgs.push(`req.body as ${op.bodyInfo.typeName}`)
    } else if (bodySchemaExpr !== undefined) {
      serviceArgs.push('req.body as any')
    } else {
      serviceArgs.push('req.body as unknown')
    }
  }

  // Query: typed via schema.querystring. preValidation has already reshaped req.query
  // for deepObject/delimiter routes, and the validatorCompiler validated the shape.
  if (op.queryParams.length > 0) {
    serviceArgs.push('req.query')
  }

  // Context: pass Fastify Request object when contextType is set.
  if (contextType !== undefined) {
    serviceArgs.push('req')
  }

  const serviceCall = `service.${op.methodName}(${serviceArgs.join(', ')})`

  // Response cast: the serializerCompiler validates the response at runtime against the response
  // schema. At compile time the ZodTypeProvider constrains reply.send() to the schema's inferred
  // type, which can diverge structurally from the service's return (model) type (e.g. a passthrough
  // object adds an index signature). When the response schema is a named schema we assert to its
  // inferred type (specific and runtime-validated); inline response schemas fall back to `any`.
  const responseCast =
    responseSchemaExpr === undefined
      ? ''
      : /^[A-Za-z_$][\w$]*$/.test(responseSchemaExpr)
        ? ` as z.infer<typeof ${responseSchemaExpr}>`
        : ' as any'

  // ── Response (no per-route try/catch: setErrorHandler handles HttpError) ──

  if (op.bodyInfo?.contentType === 'multipart/form-data') {
    // multipart/form-data: requires @fastify/multipart registered with { attachFieldsToBody: true }.
    lines.push(
      `${inner}// multipart/form-data: requires @fastify/multipart registered with { attachFieldsToBody: true }.`
    )
  } else if (op.bodyInfo?.contentType === 'application/octet-stream') {
    // application/octet-stream: req.body is a Buffer from the registered content-type parser.
    lines.push(
      `${inner}// application/octet-stream: req.body is a Buffer from the registered content-type parser.`
    )
  }

  if (op.responseStatus.isVoid) {
    lines.push(`${inner}await ${serviceCall}`)
    lines.push(`${inner}reply.status(${op.responseStatus.status}).send()`)
  } else if (op.responseStatus.isMultiStatus === true) {
    lines.push(`${inner}const _envelope = await ${serviceCall}`)
    lines.push(`${inner}return reply.status(_envelope.status).send(_envelope.body)`)
  } else if (op.responseStatus.responseContentType === 'text/plain') {
    if (op.responseStatus.status === 200) {
      lines.push(`${inner}return reply.type('text/plain').send(await ${serviceCall})`)
    } else {
      lines.push(
        `${inner}return reply.status(${op.responseStatus.status}).type('text/plain').send(await ${serviceCall})`
      )
    }
  } else if (op.responseStatus.responseContentType === 'application/octet-stream') {
    if (op.responseStatus.status === 200) {
      lines.push(
        `${inner}return reply.type('application/octet-stream').send(Buffer.from(await ${serviceCall}))`
      )
    } else {
      lines.push(
        `${inner}return reply.status(${op.responseStatus.status}).type('application/octet-stream').send(Buffer.from(await ${serviceCall}))`
      )
    }
  } else if (op.responseStatus.status === 200) {
    lines.push(`${inner}return reply.send((await ${serviceCall})${responseCast})`)
  } else {
    lines.push(
      `${inner}return reply.status(${op.responseStatus.status}).send((await ${serviceCall})${responseCast})`
    )
  }

  lines.push(`${indent}})`)
  return lines.join('\n')
}

// ── Main generator export ─────────────────────────────────────────────────────

// fallow-ignore-next-line complexity
export function generateFastifyRouter(
  spec: OpenAPIV3_1.Document,
  options?: RouterOptions
): GeneratedFile {
  const serviceName = deriveServiceName(spec)
  const operations = collectOperations(spec)

  // Collect schema names used for body and response wiring.
  const usedSchemaNames =
    options?.schemaNames !== undefined
      ? collectUsedSchemaNames(operations, options.schemaNames)
      : new Set<string>()
  const usedResponseSchemaNames =
    options?.schemaNames !== undefined
      ? collectUsedResponseSchemaNames(operations, options.schemaNames)
      : new Set<string>()
  const allUsedSchemaNames = new Set([...usedSchemaNames, ...usedResponseSchemaNames])

  // Collect body type names for model imports. All named body types are imported because
  // the handler casts req.body to the service model type (e.g. req.body as unknown as LabNumeric)
  // regardless of whether a schema is present. The cast is needed because the Zod-inferred type
  // from fastify-type-provider-zod may differ structurally from the TypeScript interface.
  const sortedBodyTypes = collectSortedBodyTypes(operations)

  // z is always needed: schema.params/querystring/headers/response use z.object/z.array/z.string.
  // Even with no operations, the cookie _ckv block uses z.
  const hasOctetStreamRequestBody = operations.some(
    (op) => op.bodyInfo?.contentType === 'application/octet-stream'
  )

  const ctx = options?.contextType
  const serviceRef = ctx !== undefined ? `${serviceName}<${ctx}>` : serviceName

  const lines: string[] = []
  lines.push('// This file is auto-generated. Do not edit manually.')
  lines.push(
    '// Fastify: register @fastify/formbody before this router for application/x-www-form-urlencoded bodies.'
  )
  lines.push(
    '// For multipart/form-data bodies, register @fastify/multipart with { attachFieldsToBody: true } before this router.'
  )
  lines.push('')
  lines.push(
    "import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod'"
  )
  lines.push("import type { FastifyInstance } from 'fastify'")
  if (sortedBodyTypes.length > 0) {
    lines.push(`import type { ${sortedBodyTypes.join(', ')} } from './models.js'`)
  }
  lines.push(`import type { ${serviceName} } from './service.js'`)
  // z is always imported for schema.params/querystring/headers/response and cookie _ckv blocks.
  lines.push(`import { z } from 'zod'`)
  if (allUsedSchemaNames.size > 0 && options?.schemaImportPath !== undefined) {
    const sortedUsedSchemas = Array.from(allUsedSchemaNames).sort()
    lines.push(`import { ${sortedUsedSchemas.join(', ')} } from '${options.schemaImportPath}'`)
  }
  lines.push('')
  // Augment FastifyContextConfig so that config: { operationId } on each route is type-safe (#309).
  lines.push("declare module 'fastify' {")
  lines.push('  interface FastifyContextConfig {')
  lines.push('    operationId?: string')
  lines.push('  }')
  lines.push('}')
  lines.push('')
  for (const l of httpErrorClassLines()) lines.push(l)
  lines.push('')
  lines.push(`export function createRouter(app: FastifyInstance, service: ${serviceRef}): void {`)

  // Register type-provider compilers and a single error handler once at the top.
  // withTypeProvider returns a new typed FastifyInstance; routes must be registered on _app so
  // ZodTypeProvider can infer req.body/req.query/req.params from the schema blocks.
  lines.push('  const _app = app.withTypeProvider<ZodTypeProvider>()')
  lines.push('  app.setValidatorCompiler(validatorCompiler)')
  lines.push('  app.setSerializerCompiler(serializerCompiler)')
  lines.push('  app.setErrorHandler((err, _req, reply) => {')
  lines.push('    if (err instanceof HttpError) {')
  lines.push('      return reply.status(err.status).send({ error: err.message })')
  lines.push('    }')
  lines.push('    throw err')
  lines.push('  })')

  // Register a content-type parser for application/octet-stream when needed.
  if (hasOctetStreamRequestBody) {
    lines.push(
      "  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (req, body, done) => done(null, body))"
    )
  }

  for (const op of operations) {
    lines.push('')
    lines.push(buildFastifyTypeProviderHandler(op, '  ', spec, options?.schemaNames, ctx))
  }

  lines.push('}')
  lines.push('')

  return {
    filename: 'router.ts',
    content: lines.join('\n'),
  }
}
