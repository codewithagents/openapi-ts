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
  sanitizeOperationId,
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

/** Convert OpenAPI path to Hono path: {id} -> :id */
function toHonoPath(openapiPath: string): string {
  return openapiPath.replace(/\{([^}]+)\}/g, ':$1')
}

// ── Param validation helpers ──────────────────────────────────────────────────

/** Represents a path parameter that needs Zod format validation. */
interface PathParamValidation {
  /** Raw name as it appears in the URL path (e.g. 'job-id'). */
  rawName: string
  /** Zod chain expression for the value (e.g. 'z.string().uuid()'). */
  zodExpr: string
}

/** Represents a header parameter to validate. */
interface HeaderParam {
  /** Header name as defined in the spec (e.g. 'x-api-key'). */
  rawName: string
  /** Whether the header is required. */
  required: boolean
  /** Allowed values from the schema enum constraint. */
  enum?: string[]
  /** Minimum string length from schema.minLength. */
  minLength?: number
  /** Maximum string length from schema.maxLength. */
  maxLength?: number
  /** Regex pattern from schema.pattern. */
  pattern?: string
}

/**
 * Map a schema format string to a Zod chain modifier.
 * Returns an empty string when no specific format validation is needed.
 */
function formatToZodModifier(format: string): string {
  switch (format) {
    case 'uuid':
      return '.uuid()'
    case 'email':
      return '.email()'
    case 'uri':
    case 'url':
      return '.url()'
    case 'date-time':
      return '.datetime()'
    default:
      return ''
  }
}

/**
 * Build a Zod expression for a path parameter based on its schema.
 * Returns undefined when the parameter does not need validation.
 *
 * String params: validates format (uuid, email, url, date-time) via z.string().format().
 * Integer/number params: validates range (minimum/maximum) via z.coerce.number().min().max().
 * z.coerce.number() is used for path params because c.req.param() always returns a string;
 * coercion converts the URL string to a number before the min/max check.
 */
function pathParamZodExpr(
  schema: OpenAPIV3_1.SchemaObject | ReferenceObject | undefined
): string | undefined {
  if (schema === undefined || isRef(schema)) return undefined
  const s = schema as OpenAPIV3_1.SchemaObject & {
    exclusiveMinimum?: number | boolean
    exclusiveMaximum?: number | boolean
  }

  // Integer / number path params with range constraints
  if (s.type === 'integer' || s.type === 'number') {
    const hasMin = typeof s.minimum === 'number'
    const hasMax = typeof s.maximum === 'number'
    const hasExcMin = typeof s.exclusiveMinimum === 'number'
    const hasExcMax = typeof s.exclusiveMaximum === 'number'
    if (hasMin || hasMax || hasExcMin || hasExcMax) {
      let expr = 'z.coerce.number()'
      if (hasMin) expr += `.min(${s.minimum})`
      if (hasMax) expr += `.max(${s.maximum})`
      if (hasExcMin) expr += `.gt(${s.exclusiveMinimum})`
      if (hasExcMax) expr += `.lt(${s.exclusiveMaximum})`
      return expr
    }
    return undefined
  }

  // String path params: only validated when a known format modifier exists
  if (s.type !== 'string') return undefined
  const format = s.format as string | undefined
  if (format === undefined) return undefined
  const modifier = formatToZodModifier(format)
  if (modifier === '') return undefined
  return `z.string()${modifier}`
}

/**
 * Build a Zod expression for a query parameter based on its captured constraints.
 * Number/integer types use z.number() (after coercion by extraction code).
 * String types use z.string() with optional format/enum/pattern/length modifiers.
 * Delimited array params use z.array(z.string()).
 * DeepObject params use z.object({...}) with per-property coercion.
 * Appends .optional() for non-required params.
 */
function queryParamZodExpr(param: QueryParam): string {
  // Delimited array param: value has been split into string[]
  if (param.delimiterStyle !== undefined) {
    const base = 'z.array(z.string())'
    return param.required ? base : `${base}.optional()`
  }

  // DeepObject param: assembled into Record<string, string>; emit z.object with coercion
  if (param.isDeepObject === true && param.deepObjectProperties !== undefined) {
    const propFields = param.deepObjectProperties.map((p) => {
      const coerced = p.tsType === 'number' ? 'z.coerce.number()' : 'z.string()'
      // Only required properties are known from the spec; treat all as optional here
      // so Zod validates presence via .required() on the outer object if needed.
      return `${p.key}: ${coerced}.optional()`
    })
    const base = `z.object({ ${propFields.join(', ')} })`
    return param.required ? base : `${base}.optional()`
  }

  let base: string
  if (param.tsType === 'number') {
    base = 'z.number()'
    if (param.minimum !== undefined) base += `.min(${param.minimum})`
    if (param.maximum !== undefined) base += `.max(${param.maximum})`
    if (param.exclusiveMinimum !== undefined) base += `.gt(${param.exclusiveMinimum})`
    if (param.exclusiveMaximum !== undefined) base += `.lt(${param.exclusiveMaximum})`
  } else if (param.tsType === 'boolean') {
    base = 'z.boolean()'
  } else {
    // string — check for enum first, then format/pattern/length
    if (param.enum !== undefined && param.enum.length > 0) {
      const members = param.enum.map((v) => JSON.stringify(v)).join(', ')
      base = `z.enum([${members}])`
    } else {
      base = 'z.string()'
    }
    if (param.minLength !== undefined) base += `.min(${param.minLength})`
    if (param.maxLength !== undefined) base += `.max(${param.maxLength})`
    if (param.pattern !== undefined) base += `.regex(/${param.pattern}/)`
  }
  return param.required ? base : `${base}.optional()`
}

/**
 * Build a Zod expression for a header parameter based on its captured constraints.
 * Header values are always strings; emits z.string() or z.enum([...]) with optional
 * pattern/length modifiers. Appends .optional() for non-required params.
 */
function headerParamZodExpr(param: HeaderParam): string {
  let base: string
  if (param.enum !== undefined && param.enum.length > 0) {
    const members = param.enum.map((v) => JSON.stringify(v)).join(', ')
    base = `z.enum([${members}])`
  } else {
    base = 'z.string()'
  }
  if (param.minLength !== undefined) base += `.min(${param.minLength})`
  if (param.maxLength !== undefined) base += `.max(${param.maxLength})`
  if (param.pattern !== undefined) base += `.regex(/${param.pattern}/)`
  return param.required ? base : `${base}.optional()`
}

/**
 * Collect path parameters that have Zod format constraints.
 * Only returns entries for params that need format validation (e.g. uuid).
 * Simple string params with no format constraint are excluded.
 */
function getPathParamValidations(
  operation: OperationObject,
  spec: OpenAPIV3_1.Document,
  rawPathParamNames: string[]
): PathParamValidation[] {
  const parameters = operation.parameters as (ParameterObject | ReferenceObject)[] | undefined
  if (parameters === undefined) return []

  // Build a name-to-zodExpr map from path params to avoid nested loops.
  const zodByName = new Map<string, string>()
  for (const p of parameters) {
    const resolved = resolveParam(p, spec)
    if (resolved === undefined || resolved.in !== 'path') continue
    const schema = resolved.schema as OpenAPIV3_1.SchemaObject | ReferenceObject | undefined
    const zodExpr = pathParamZodExpr(schema)
    if (zodExpr !== undefined) zodByName.set(resolved.name, zodExpr)
  }

  const result: PathParamValidation[] = []
  for (const rawName of rawPathParamNames) {
    const zodExpr = zodByName.get(rawName)
    if (zodExpr !== undefined) result.push({ rawName, zodExpr })
  }
  return result
}

/**
 * Collect header parameters from an operation, including schema constraints.
 */
function getHeaderParams(operation: OperationObject, spec: OpenAPIV3_1.Document): HeaderParam[] {
  const parameters = operation.parameters as (ParameterObject | ReferenceObject)[] | undefined
  if (parameters === undefined) return []

  const result: HeaderParam[] = []
  for (const p of parameters) {
    const resolved = resolveParam(p, spec)
    if (resolved === undefined || resolved.in !== 'header') continue
    const param: HeaderParam = {
      rawName: resolved.name,
      required: resolved.required === true,
    }
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

/**
 * Returns true when a query param carries schema constraints beyond basic type/required.
 * These constraints require a Zod validation block even if the param is optional or string.
 */
function queryParamHasConstraints(q: QueryParam): boolean {
  return (
    q.enum !== undefined ||
    q.minimum !== undefined ||
    q.maximum !== undefined ||
    q.exclusiveMinimum !== undefined ||
    q.exclusiveMaximum !== undefined ||
    q.minLength !== undefined ||
    q.maxLength !== undefined ||
    q.pattern !== undefined ||
    q.delimiterStyle !== undefined ||
    q.isDeepObject === true
  )
}

/**
 * Determine whether query params need a Zod validation block.
 * Triggered when any param is required, has a non-string type (to catch NaN/invalid input),
 * or carries schema constraints (enum, min/max, pattern, etc.).
 */
function queryParamsNeedValidation(queryParams: QueryParam[]): boolean {
  return queryParams.some(
    (q) => q.required || q.tsType !== 'string' || queryParamHasConstraints(q)
  )
}

/** Returns the delimiter character for a delimited-style array query param. */
function delimiterChar(style: 'csv' | 'ssv' | 'psv'): string {
  if (style === 'ssv') return ' '
  if (style === 'psv') return '|'
  return ','
}

/**
 * Emit Zod validation lines for query parameters into the handler line buffer.
 * Uses the already-extracted params object (after Number() coercion).
 * Uses short variable name _qv to keep the 422 return line under Prettier's print width.
 * @param indent - outer handler indent (e.g. '  ')
 */
function emitQueryValidation(lines: string[], queryParams: QueryParam[], indent: string): void {
  const inner = `${indent}  `
  const fieldIndent = `${indent}    `
  const fields = queryParams
    .map((q) => {
      const expr = queryParamZodExpr(q)
      return `${fieldIndent}${q.name}: ${expr}`
    })
    .join(',\n')
  lines.push(`${inner}// Validate query parameters: returns 422 with Zod issues on failure`)
  lines.push(`${inner}const _qv = z.object({`)
  lines.push(fields)
  lines.push(`${inner}}).safeParse(params)`)
}

/**
 * Emit Zod validation lines for path parameters (format constraints) into the handler line buffer.
 * Uses short variable name _pv to keep the 422 return line under Prettier's print width.
 * @param indent - outer handler indent (e.g. '  ')
 * @param framework - used to generate the correct param accessor syntax
 */
function emitPathValidation(
  lines: string[],
  validations: PathParamValidation[],
  indent: string,
  framework: 'hono' | 'express' | 'fastify'
): void {
  const inner = `${indent}  `
  const fieldIndent = `${indent}    `
  const schemaFields = validations
    .map((v) => {
      const key = /[^a-zA-Z0-9_$]/.test(v.rawName) ? JSON.stringify(v.rawName) : v.rawName
      return `${fieldIndent}${key}: ${v.zodExpr}`
    })
    .join(',\n')
  const rawFields = validations
    .map((v) => {
      const key = /[^a-zA-Z0-9_$]/.test(v.rawName) ? JSON.stringify(v.rawName) : v.rawName
      let access: string
      if (framework === 'hono') {
        access = `c.req.param(${JSON.stringify(v.rawName)})`
      } else if (framework === 'express') {
        access = `req.params[${JSON.stringify(v.rawName)}]`
      } else {
        access = /[^a-zA-Z0-9_$]/.test(v.rawName)
          ? `req.params[${JSON.stringify(v.rawName)}]`
          : `req.params.${v.rawName}`
      }
      return `${fieldIndent}${key}: ${access}`
    })
    .join(',\n')
  lines.push(`${inner}// Validate path parameters: returns 422 with Zod issues on failure`)
  lines.push(`${inner}const _pv = z.object({`)
  lines.push(schemaFields)
  lines.push(`${inner}}).safeParse({`)
  lines.push(rawFields)
  lines.push(`${inner}})`)
}

/**
 * Emit Zod validation lines for header parameters into the handler line buffer.
 * Uses short variable name _hv to keep the 422 return line under Prettier's print width.
 * @param indent - outer handler indent (e.g. '  ')
 * @param framework - used to generate the correct header accessor syntax
 */
function emitHeaderValidation(
  lines: string[],
  headerParams: HeaderParam[],
  indent: string,
  framework: 'hono' | 'express' | 'fastify'
): void {
  const inner = `${indent}  `
  const fieldIndent = `${indent}    `
  const schemaFields = headerParams
    .map((h) => {
      const key = JSON.stringify(h.rawName)
      const expr = headerParamZodExpr(h)
      return `${fieldIndent}${key}: ${expr}`
    })
    .join(',\n')
  const rawFields = headerParams
    .map((h) => {
      const key = JSON.stringify(h.rawName)
      let access: string
      if (framework === 'hono') {
        access = `c.req.header(${key})`
      } else if (framework === 'express') {
        access = `req.headers[${key}] as string | undefined`
      } else {
        access = `req.headers[${key}]`
      }
      return `${fieldIndent}${key}: ${access}`
    })
    .join(',\n')
  lines.push(`${inner}// Validate request headers: returns 422 with Zod issues on failure`)
  lines.push(`${inner}const _hv = z.object({`)
  lines.push(schemaFields)
  lines.push(`${inner}}).safeParse({`)
  lines.push(rawFields)
  lines.push(`${inner}})`)
}

interface ResponseStatus {
  status: number
  isVoid: boolean
  /**
   * The content type declared by the success response.
   * Drives the framework-specific response emit (c.json / c.text / c.body).
   * Defaults to 'application/json' for JSON and void responses.
   */
  responseContentType: 'application/json' | 'text/plain' | 'application/octet-stream'
  /**
   * True when the operation declares more than one 2xx success response.
   * The service method returns { status: number; body: T } and the router
   * forwards result.status and result.body verbatim, letting the handler
   * choose the appropriate status code at runtime.
   */
  isMultiStatus?: boolean
}

function response200IsVoid(resp: ResponseObject | ReferenceObject): boolean {
  if (isRef(resp)) return false
  const r = resp as ResponseObject
  const content = r.content as Record<string, unknown> | undefined
  return content === undefined || Object.keys(content).length === 0
}

/**
 * Detect the success response content type from a ResponseObject.
 * Returns 'text/plain' or 'application/octet-stream' for non-JSON responses,
 * or 'application/json' as the default.
 */
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

  // Multi-status: more than one 2xx response with a body (excluding 204/void).
  // Must be checked before individual 200/201/204 branches so that e.g. 200+202
  // is not absorbed by the responses['200'] early return.
  // The handler selects the status at runtime via a { status, body } envelope.
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

  // Single non-200/201/204 2xx declared: honor that exact status code.
  const twoxxKeys = Object.keys(responses).filter(
    (k) => /^2\d\d$/.test(k) && k !== '200' && k !== '201' && k !== '204'
  )
  if (twoxxKeys.length === 1) {
    const code = parseInt(twoxxKeys[0], 10)
    const resp = responses[twoxxKeys[0]]
    const isVoid =
      isRef(resp)
        ? false
        : (() => {
            const r = resp as ResponseObject
            const content = r.content as Record<string, unknown> | undefined
            return content === undefined || Object.keys(content).length === 0
          })()
    return { status: code, isVoid, responseContentType: detectResponseContentType(resp) }
  }

  // Default: delete -> 204, otherwise 200
  return httpMethod === 'delete'
    ? { status: 204, isVoid: true, responseContentType: 'application/json' }
    : { status: 200, isVoid: false, responseContentType: 'application/json' }
}

interface RouteOperation {
  methodName: string
  httpMethod: SupportedMethod
  path: string
  honoPath: string
  pathParams: string[]
  pathParamValidations: PathParamValidation[]
  queryParams: QueryParam[]
  headerParams: HeaderParam[]
  bodyInfo: BodyInfo | undefined
  responseStatus: ResponseStatus
}

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
      const pathParamValidations = getPathParamValidations(operation, spec, pathParams)
      const queryParams = getQueryParams(operation, spec)
      const headerParams = getHeaderParams(operation, spec)
      const bodyInfo = getBodyInfo(operation)
      const responseStatus = getResponseStatus(operation, method)

      operations.push({
        methodName,
        httpMethod: method,
        path,
        honoPath: toHonoPath(path),
        pathParams,
        pathParamValidations,
        queryParams,
        headerParams,
        bodyInfo,
        responseStatus,
      })
    }
  }

  return operations
}

// ── Shared options interface ──────────────────────────────────────────────────

interface RouterOptions {
  schemaNames?: Set<string>
  schemaImportPath?: string
}

interface GeneratorSetup {
  sortedBodyTypes: string[]
  usedSchemaNames: Set<string>
  needsZod: boolean
}

/** Collect sorted body type names from all operations.
 * Synthesized names (inline schema, no $ref) are excluded because they have no
 * corresponding entry in models.ts and must not appear in the model import.
 */
function collectSortedBodyTypes(operations: RouteOperation[]): string[] {
  const bodyTypes = new Set<string>()
  for (const op of operations) {
    if (op.bodyInfo?.typeName !== undefined && !op.bodyInfo.isSynthesized) {
      bodyTypes.add(op.bodyInfo.typeName)
    }
  }
  return Array.from(bodyTypes).sort()
}

/** Collect the subset of schemaNames actually used by the given operations. */
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

/**
 * Collect body type names, used schema names, and whether Zod is needed.
 * Shared by all three generator functions to avoid duplication.
 */
function collectGeneratorSetup(
  operations: RouteOperation[],
  options?: RouterOptions
): GeneratorSetup {
  const sortedBodyTypes = collectSortedBodyTypes(operations)
  const usedSchemaNames =
    options?.schemaNames !== undefined
      ? collectUsedSchemaNames(operations, options.schemaNames)
      : new Set<string>()
  const needsZod =
    (usedSchemaNames.size > 0 && options?.schemaImportPath !== undefined) ||
    operationsNeedZodForParams(operations)
  return { sortedBodyTypes, usedSchemaNames, needsZod }
}

// ── Hono route handler ────────────────────────────────────────────────────────

// fallow-ignore-next-line complexity
function buildRouteHandler(op: RouteOperation, indent: string, schemaNames?: Set<string>): string {
  const lines: string[] = []
  lines.push(`${indent}app.${op.httpMethod}(${JSON.stringify(op.honoPath)}, async (c) => {`)

  // Path param format validation (e.g. uuid)
  if (op.pathParamValidations.length > 0) {
    emitPathValidation(lines, op.pathParamValidations, indent, 'hono')
    lines.push(`${indent}  if (!_pv.success) {`)
    lines.push(
      `${indent}    return c.json({ error: 'Invalid path parameters', issues: _pv.error.issues }, 422)`
    )
    lines.push(`${indent}  }`)
  }

  // Query params extraction
  if (op.queryParams.length > 0) {
    // Emit deepObject assembly blocks before the params object.
    // c.req.queries() returns Record<string, string[]> with raw bracket-notation keys.
    const deepObjectParams = op.queryParams.filter((q) => q.isDeepObject === true)
    if (deepObjectParams.length > 0) {
      lines.push(`${indent}  const _dq = c.req.queries()`)
      for (const q of deepObjectParams) {
        const prefixLen = q.rawName.length + 1 // e.g. 'filter['.length
        const bracketPrefix = q.rawName + '['
        lines.push(`${indent}  const ${q.name} = Object.fromEntries(`)
        lines.push(
          `${indent}    Object.entries(_dq).filter(([k]) => k.startsWith('${bracketPrefix}') && k.endsWith(']')).map(([k, vs]) => [k.slice(${prefixLen}, -1), vs[0]])`
        )
        lines.push(`${indent}  )`)
      }
    }

    const fields = op.queryParams
      .map((q) => {
        if (q.isDeepObject === true) {
          // Already assembled above as a local variable
          return `    ${q.name}`
        }
        if (q.delimiterStyle !== undefined) {
          // Use rawName to match the actual URL query key (e.g. 'csv', 'ssv', 'psv').
          const delim = JSON.stringify(delimiterChar(q.delimiterStyle))
          return `    ${q.name}: c.req.query('${q.rawName}') !== undefined ? c.req.query('${q.rawName}')!.split(${delim}) : undefined`
        }
        if (q.tsType === 'number') {
          return `    ${q.name}: c.req.query('${q.name}') !== undefined ? Number(c.req.query('${q.name}')) : undefined`
        }
        return `    ${q.name}: c.req.query('${q.name}') ?? undefined`
      })
      .join(',\n')
    lines.push(`${indent}  const params = {`)
    lines.push(fields)
    lines.push(`${indent}  }`)

    // Validate query params when there are required or typed (non-string) params
    if (queryParamsNeedValidation(op.queryParams)) {
      emitQueryValidation(lines, op.queryParams, indent)
      lines.push(`${indent}  if (!_qv.success) {`)
      lines.push(
        `${indent}    return c.json({ error: 'Invalid query parameters', issues: _qv.error.issues }, 422)`
      )
      lines.push(`${indent}  }`)
    }
  }

  // Header param validation
  if (op.headerParams.length > 0) {
    emitHeaderValidation(lines, op.headerParams, indent, 'hono')
    lines.push(`${indent}  if (!_hv.success) {`)
    lines.push(
      `${indent}    return c.json({ error: 'Invalid request headers', issues: _hv.error.issues }, 422)`
    )
    lines.push(`${indent}  }`)
  }

  // Body extraction
  let bodyVarName = 'body'
  if (op.bodyInfo !== undefined) {
    // Synthesized names (inline schemas) are schema-only; the TS type is unknown.
    const typeDecl =
      op.bodyInfo.typeName !== undefined && !op.bodyInfo.isSynthesized
        ? op.bodyInfo.typeName
        : 'unknown'

    if (op.bodyInfo.contentType === 'application/x-www-form-urlencoded') {
      // Form-urlencoded: check Content-Type then decode with parseBody().
      // Values arrive as strings; Zod coercion handles type conversion (e.g. z.coerce.number()).
      lines.push(`${indent}  const _ct = c.req.header('content-type') ?? ''`)
      lines.push(
        `${indent}  if (!_ct.toLowerCase().startsWith('application/x-www-form-urlencoded')) {`
      )
      lines.push(`${indent}    return c.json({ error: 'Unsupported Media Type' }, 415)`)
      lines.push(`${indent}  }`)
      lines.push(`${indent}  const body: unknown = await c.req.parseBody()`)
    } else {
      // JSON body: check Content-Type then parse with JSON.parse (not c.req.json()).
      // c.req.text() + JSON.parse() is used instead of c.req.json() because Hono's
      // c.req.json() silently returns null for an empty body instead of throwing,
      // which would pass the try/catch and reach Zod as null, causing a 422 rather
      // than the correct 400. JSON.parse('') always throws SyntaxError.
      lines.push(`${indent}  const _ct = c.req.header('content-type') ?? ''`)
      lines.push(`${indent}  if (!_ct.toLowerCase().startsWith('application/json')) {`)
      lines.push(`${indent}    return c.json({ error: 'Unsupported Media Type' }, 415)`)
      lines.push(`${indent}  }`)
      lines.push(`${indent}  let body: ${typeDecl}`)
      lines.push(`${indent}  try {`)
      lines.push(`${indent}    body = JSON.parse(await c.req.text()) as ${typeDecl}`)
      lines.push(`${indent}  } catch {`)
      lines.push(`${indent}    return c.json({ error: 'Invalid JSON body' }, 400)`)
      lines.push(`${indent}  }`)
    }

    // Zod validation when schema is available
    const schemaName =
      op.bodyInfo.typeName !== undefined ? `${op.bodyInfo.typeName}Schema` : undefined
    if (schemaName !== undefined && schemaNames !== undefined && schemaNames.has(schemaName)) {
      lines.push(`${indent}  // Validate request body: returns 422 with Zod issues on failure`)
      lines.push(`${indent}  const parseResult = ${schemaName}.safeParse(body)`)
      lines.push(`${indent}  if (!parseResult.success) {`)
      lines.push(
        `${indent}    return c.json({ error: 'Invalid request body', issues: parseResult.error.issues }, 422)`
      )
      lines.push(`${indent}  }`)
      lines.push(`${indent}  const validatedBody = parseResult.data`)
      bodyVarName = 'validatedBody'
    }
  }

  // Build service call args
  const serviceArgs: string[] = []
  for (const p of op.pathParams) {
    serviceArgs.push(`c.req.param(${JSON.stringify(p)})`)
  }
  if (op.bodyInfo !== undefined) {
    serviceArgs.push(bodyVarName)
  }
  if (op.queryParams.length > 0) {
    serviceArgs.push('params')
  }

  const serviceCall = `service.${op.methodName}(${serviceArgs.join(', ')})`

  // Response — wrap in try/catch to map HttpError to its status
  lines.push(`${indent}  try {`)
  if (op.responseStatus.isVoid) {
    lines.push(`${indent}    await ${serviceCall}`)
    lines.push(`${indent}    return new Response(null, { status: ${op.responseStatus.status} })`)
  } else if (op.responseStatus.isMultiStatus === true) {
    // Multi-status: service returns { status: number; body: T }; router forwards both.
    lines.push(`${indent}    const _envelope = await ${serviceCall}`)
    lines.push(`${indent}    return c.json(_envelope.body, _envelope.status as any)`)
  } else if (op.responseStatus.responseContentType === 'text/plain') {
    if (op.responseStatus.status === 200) {
      lines.push(`${indent}    return c.text(await ${serviceCall})`)
    } else {
      lines.push(`${indent}    return c.text(await ${serviceCall}, ${op.responseStatus.status})`)
    }
  } else if (op.responseStatus.responseContentType === 'application/octet-stream') {
    if (op.responseStatus.status === 200) {
      lines.push(`${indent}    const _result = await ${serviceCall}`)
      lines.push(
        `${indent}    return new Response(_result, { headers: { 'content-type': 'application/octet-stream' } })`
      )
    } else {
      lines.push(`${indent}    const _result = await ${serviceCall}`)
      lines.push(
        `${indent}    return new Response(_result, { status: ${op.responseStatus.status}, headers: { 'content-type': 'application/octet-stream' } })`
      )
    }
  } else if (op.responseStatus.status === 200) {
    lines.push(`${indent}    return c.json(await ${serviceCall})`)
  } else {
    lines.push(`${indent}    return c.json(await ${serviceCall}, ${op.responseStatus.status})`)
  }
  lines.push(`${indent}  } catch (err) {`)
  lines.push(`${indent}    if (err instanceof HttpError) {`)
  lines.push(
    `${indent}      return new Response(JSON.stringify({ error: err.message }), { status: err.status, headers: { 'content-type': 'application/json' } })`
  )
  lines.push(`${indent}    }`)
  lines.push(`${indent}    throw err`)
  lines.push(`${indent}  }`)

  lines.push(`${indent}})`)
  return lines.join('\n')
}

// ── Express route handler ─────────────────────────────────────────────────────

// fallow-ignore-next-line complexity
function buildExpressRouteHandler(
  op: RouteOperation,
  indent: string,
  schemaNames?: Set<string>
): string {
  const lines: string[] = []
  lines.push(
    `${indent}router.${op.httpMethod}(${JSON.stringify(op.honoPath)}, async (req: Request, res: Response) => {`
  )

  // Path param format validation (e.g. uuid)
  if (op.pathParamValidations.length > 0) {
    emitPathValidation(lines, op.pathParamValidations, indent, 'express')
    lines.push(`${indent}  if (!_pv.success) {`)
    lines.push(
      `${indent}    return void res.status(422).json({ error: 'Invalid path parameters', issues: _pv.error.issues })`
    )
    lines.push(`${indent}  }`)
  }

  // Query params extraction
  if (op.queryParams.length > 0) {
    // Express (qs, extended:true) parses bracket-notation automatically:
    // filter[gte]=10 → req.query.filter = { gte: '10' }.
    // DeepObject params are already assembled; just cast the nested object.
    const fields = op.queryParams
      .map((q) => {
        if (q.isDeepObject === true) {
          // Express with qs: req.query['filter'] is already { gte: '10', lte: '20' }
          return `    ${q.name}: (req.query['${q.rawName}'] ?? {}) as Record<string, string | undefined>`
        }
        if (q.delimiterStyle !== undefined) {
          const delim = JSON.stringify(delimiterChar(q.delimiterStyle))
          return `    ${q.name}: typeof req.query['${q.rawName}'] === 'string' ? (req.query['${q.rawName}'] as string).split(${delim}) : undefined`
        }
        if (q.tsType === 'number') {
          return `    ${q.name}: Number(req.query['${q.name}'] as string)`
        }
        if (q.tsType === 'boolean') {
          return `    ${q.name}: req.query['${q.name}'] === 'true'`
        }
        return `    ${q.name}: req.query['${q.name}'] as string | undefined`
      })
      .join(',\n')
    lines.push(`${indent}  const params = {`)
    lines.push(fields)
    lines.push(`${indent}  }`)

    // Validate query params when there are required or typed (non-string) params
    if (queryParamsNeedValidation(op.queryParams)) {
      emitQueryValidation(lines, op.queryParams, indent)
      lines.push(`${indent}  if (!_qv.success) {`)
      lines.push(
        `${indent}    return void res.status(422).json({ error: 'Invalid query parameters', issues: _qv.error.issues })`
      )
      lines.push(`${indent}  }`)
    }
  }

  // Header param validation
  if (op.headerParams.length > 0) {
    emitHeaderValidation(lines, op.headerParams, indent, 'express')
    lines.push(`${indent}  if (!_hv.success) {`)
    lines.push(
      `${indent}    return void res.status(422).json({ error: 'Invalid request headers', issues: _hv.error.issues })`
    )
    lines.push(`${indent}  }`)
  }

  // Body extraction, with optional Zod validation.
  // For both JSON and form-urlencoded bodies Express pre-populates req.body via middleware
  // (express.json() for JSON, express.urlencoded() for form). The router just reads req.body.
  let bodyVarName = 'body'
  if (op.bodyInfo !== undefined) {
    const schemaName =
      op.bodyInfo.typeName !== undefined ? `${op.bodyInfo.typeName}Schema` : undefined
    const useZod =
      schemaName !== undefined && schemaNames !== undefined && schemaNames.has(schemaName)

    if (useZod) {
      lines.push(`${indent}  // Validate request body: returns 422 with Zod issues on failure`)
      lines.push(`${indent}  const parseResult = ${schemaName}.safeParse(req.body)`)
      lines.push(`${indent}  if (!parseResult.success) {`)
      lines.push(
        `${indent}    return void res.status(422).json({ error: 'Invalid request body', issues: parseResult.error.issues })`
      )
      lines.push(`${indent}  }`)
      lines.push(`${indent}  const validatedBody = parseResult.data`)
      bodyVarName = 'validatedBody'
    } else {
      // Synthesized names (inline schemas) have no model type — use plain cast to unknown.
      const typeAnnotation =
        op.bodyInfo.typeName !== undefined && !op.bodyInfo.isSynthesized
          ? ` as ${op.bodyInfo.typeName}`
          : ''
      lines.push(`${indent}  const body = req.body${typeAnnotation}`)
    }
  }

  // Build service call args
  const serviceArgs: string[] = []
  for (const p of op.pathParams) {
    serviceArgs.push(`req.params['${p}']!`)
  }
  if (op.bodyInfo !== undefined) {
    serviceArgs.push(bodyVarName)
  }
  if (op.queryParams.length > 0) {
    serviceArgs.push('params')
  }

  const serviceCall = `service.${op.methodName}(${serviceArgs.join(', ')})`

  // Response — wrap in try/catch to map HttpError to its status
  lines.push(`${indent}  try {`)
  if (op.responseStatus.isVoid) {
    lines.push(`${indent}    await ${serviceCall}`)
    lines.push(`${indent}    res.status(${op.responseStatus.status}).end()`)
  } else if (op.responseStatus.isMultiStatus === true) {
    // Multi-status: service returns { status: number; body: T }; router forwards both.
    lines.push(`${indent}    const _envelope = await ${serviceCall}`)
    lines.push(`${indent}    res.status(_envelope.status).json(_envelope.body)`)
  } else if (op.responseStatus.responseContentType === 'text/plain') {
    if (op.responseStatus.status === 200) {
      lines.push(`${indent}    res.type('text/plain').send(await ${serviceCall})`)
    } else {
      lines.push(
        `${indent}    res.status(${op.responseStatus.status}).type('text/plain').send(await ${serviceCall})`
      )
    }
  } else if (op.responseStatus.responseContentType === 'application/octet-stream') {
    if (op.responseStatus.status === 200) {
      lines.push(
        `${indent}    res.setHeader('Content-Type', 'application/octet-stream').send(Buffer.from(await ${serviceCall}))`
      )
    } else {
      lines.push(
        `${indent}    res.status(${op.responseStatus.status}).setHeader('Content-Type', 'application/octet-stream').send(Buffer.from(await ${serviceCall}))`
      )
    }
  } else if (op.responseStatus.status === 200) {
    lines.push(`${indent}    res.json(await ${serviceCall})`)
  } else {
    lines.push(`${indent}    res.status(${op.responseStatus.status}).json(await ${serviceCall})`)
  }
  lines.push(`${indent}  } catch (err) {`)
  lines.push(`${indent}    if (err instanceof HttpError) {`)
  lines.push(`${indent}      return void res.status(err.status).json({ error: err.message })`)
  lines.push(`${indent}    }`)
  lines.push(`${indent}    throw err`)
  lines.push(`${indent}  }`)

  lines.push(`${indent}})`)
  return lines.join('\n')
}

// ── Fastify route handler ─────────────────────────────────────────────────────

// fallow-ignore-next-line complexity
function buildFastifyRouteHandler(
  op: RouteOperation,
  indent: string,
  schemaNames?: Set<string>
): string {
  const lines: string[] = []

  // Build generic type argument
  const genericParts: string[] = []

  if (op.queryParams.length > 0) {
    // DeepObject and delimited params use bracket-notation keys or raw strings;
    // include them as Record<string, string> or string[] in the Querystring generic.
    const hasDeepOrDelimited = op.queryParams.some(
      (q) => q.isDeepObject === true || q.delimiterStyle !== undefined
    )
    let querystringType: string
    if (hasDeepOrDelimited) {
      // Use a loose Querystring type that allows bracket-notation keys (fast-querystring stores
      // them as literal strings, e.g. 'filter[gte]') and array values for delimited params.
      querystringType = 'Record<string, string | string[] | undefined>'
    } else {
      const queryFields = op.queryParams
        .map((q) => {
          if (q.tsType === 'number') return `${q.name}?: number`
          if (q.tsType === 'boolean') return `${q.name}?: boolean`
          return `${q.name}?: string`
        })
        .join('; ')
      querystringType = `{ ${queryFields} }`
    }
    genericParts.push(`Querystring: ${querystringType}`)
  }

  if (op.bodyInfo !== undefined && op.bodyInfo.typeName !== undefined && !op.bodyInfo.isSynthesized) {
    genericParts.push(`Body: ${op.bodyInfo.typeName}`)
  } else if (op.bodyInfo !== undefined) {
    genericParts.push('Body: unknown')
  }

  if (op.pathParams.length > 0) {
    const paramFields = op.pathParams.map((p) => `${p}: string`).join('; ')
    genericParts.push(`Params: { ${paramFields} }`)
  }

  const generic = genericParts.length > 0 ? `<{ ${genericParts.join('; ')} }>` : ''
  lines.push(
    `${indent}app.${op.httpMethod}${generic}(${JSON.stringify(op.honoPath)}, async (req, reply) => {`
  )

  // Path param format validation (e.g. uuid)
  if (op.pathParamValidations.length > 0) {
    emitPathValidation(lines, op.pathParamValidations, indent, 'fastify')
    lines.push(`${indent}  if (!_pv.success) {`)
    lines.push(`${indent}    return reply.status(422).send({`)
    lines.push(`${indent}      error: 'Invalid path parameters',`)
    lines.push(`${indent}      issues: _pv.error.issues,`)
    lines.push(`${indent}    })`)
    lines.push(`${indent}  }`)
  }

  // Query params extraction
  if (op.queryParams.length > 0) {
    // fast-querystring (Fastify default) stores bracket-notation keys as literals:
    // filter[gte]=10 → req.query['filter[gte]'] = '10'.
    // DeepObject and delimited params need raw string access; emit _dq cast once.
    const deepObjectParams = op.queryParams.filter((q) => q.isDeepObject === true)
    const hasDeepOrDelimited = op.queryParams.some(
      (q) => q.isDeepObject === true || q.delimiterStyle !== undefined
    )

    if (hasDeepOrDelimited) {
      lines.push(
        `${indent}  const _dq = req.query as unknown as Record<string, string | undefined>`
      )
    }

    if (deepObjectParams.length > 0) {
      for (const q of deepObjectParams) {
        const prefixLen = q.rawName.length + 1 // e.g. 'filter['.length
        const bracketPrefix = q.rawName + '['
        lines.push(`${indent}  const ${q.name} = Object.fromEntries(`)
        lines.push(
          `${indent}    Object.entries(_dq).filter(([k]) => k.startsWith('${bracketPrefix}') && k.endsWith(']')).map(([k, v]) => [k.slice(${prefixLen}, -1), v])`
        )
        lines.push(`${indent}  )`)
      }
    }

    const fields = op.queryParams
      .map((q) => {
        if (q.isDeepObject === true) {
          // Already assembled above as a local variable
          return `    ${q.name}`
        }
        if (q.delimiterStyle !== undefined) {
          const delim = JSON.stringify(delimiterChar(q.delimiterStyle))
          return `    ${q.name}: typeof _dq['${q.rawName}'] === 'string' ? _dq['${q.rawName}']!.split(${delim}) : undefined`
        }
        // When _dq is defined, use it for consistent access; otherwise use typed req.query.
        return hasDeepOrDelimited
          ? `    ${q.name}: _dq['${q.rawName}']`
          : `    ${q.name}: req.query.${q.name}`
      })
      .join(',\n')
    lines.push(`${indent}  const params = {`)
    lines.push(fields)
    lines.push(`${indent}  }`)

    // Validate query params when there are required or typed (non-string) params
    if (queryParamsNeedValidation(op.queryParams)) {
      emitQueryValidation(lines, op.queryParams, indent)
      lines.push(`${indent}  if (!_qv.success) {`)
      lines.push(`${indent}    return reply.status(422).send({`)
      lines.push(`${indent}      error: 'Invalid query parameters',`)
      lines.push(`${indent}      issues: _qv.error.issues,`)
      lines.push(`${indent}    })`)
      lines.push(`${indent}  }`)
    }
  }

  // Header param validation
  if (op.headerParams.length > 0) {
    emitHeaderValidation(lines, op.headerParams, indent, 'fastify')
    lines.push(`${indent}  if (!_hv.success) {`)
    lines.push(`${indent}    return reply.status(422).send({`)
    lines.push(`${indent}      error: 'Invalid request headers',`)
    lines.push(`${indent}      issues: _hv.error.issues,`)
    lines.push(`${indent}    })`)
    lines.push(`${indent}  }`)
  }

  // Body handling, with optional Zod validation.
  // Fastify pre-parses req.body for both JSON and form-urlencoded bodies via plugins.
  let bodyVarName = 'req.body'
  if (op.bodyInfo !== undefined) {
    const schemaName =
      op.bodyInfo.typeName !== undefined ? `${op.bodyInfo.typeName}Schema` : undefined
    const useZod =
      schemaName !== undefined && schemaNames !== undefined && schemaNames.has(schemaName)

    if (useZod) {
      lines.push(`${indent}  // Validate request body: returns 422 with Zod issues on failure`)
      lines.push(`${indent}  const parseResult = ${schemaName}.safeParse(req.body)`)
      lines.push(`${indent}  if (!parseResult.success) {`)
      lines.push(
        `${indent}    return reply.status(422).send({ error: 'Invalid request body', issues: parseResult.error.issues })`
      )
      lines.push(`${indent}  }`)
      bodyVarName = 'parseResult.data'
    }
  }

  // Build service call args
  const serviceArgs: string[] = []
  for (const p of op.pathParams) {
    serviceArgs.push(`req.params.${p}`)
  }
  if (op.bodyInfo !== undefined) {
    serviceArgs.push(bodyVarName)
  }
  if (op.queryParams.length > 0) {
    serviceArgs.push('params')
  }

  const serviceCall = `service.${op.methodName}(${serviceArgs.join(', ')})`

  // Response — wrap in try/catch to map HttpError to its status
  lines.push(`${indent}  try {`)
  if (op.responseStatus.isVoid) {
    lines.push(`${indent}    await ${serviceCall}`)
    lines.push(`${indent}    reply.status(${op.responseStatus.status}).send()`)
  } else if (op.responseStatus.isMultiStatus === true) {
    // Multi-status: service returns { status: number; body: T }; router forwards both.
    lines.push(`${indent}    const _envelope = await ${serviceCall}`)
    lines.push(`${indent}    return reply.status(_envelope.status).send(_envelope.body)`)
  } else if (op.responseStatus.responseContentType === 'text/plain') {
    if (op.responseStatus.status === 200) {
      lines.push(`${indent}    return reply.type('text/plain').send(await ${serviceCall})`)
    } else {
      lines.push(`${indent}    return reply.status(${op.responseStatus.status}).type('text/plain').send(await ${serviceCall})`)
    }
  } else if (op.responseStatus.responseContentType === 'application/octet-stream') {
    if (op.responseStatus.status === 200) {
      lines.push(`${indent}    return reply.type('application/octet-stream').send(Buffer.from(await ${serviceCall}))`)
    } else {
      lines.push(`${indent}    return reply.status(${op.responseStatus.status}).type('application/octet-stream').send(Buffer.from(await ${serviceCall}))`)
    }
  } else if (op.responseStatus.status === 200) {
    lines.push(`${indent}    return ${serviceCall}`)
  } else {
    lines.push(`${indent}    reply.status(${op.responseStatus.status})`)
    lines.push(`${indent}    return ${serviceCall}`)
  }
  lines.push(`${indent}  } catch (err) {`)
  lines.push(`${indent}    if (err instanceof HttpError) {`)
  lines.push(`${indent}      return reply.status(err.status).send({ error: err.message })`)
  lines.push(`${indent}    }`)
  lines.push(`${indent}    throw err`)
  lines.push(`${indent}  }`)

  lines.push(`${indent}})`)
  return lines.join('\n')
}

// ── HttpError class ───────────────────────────────────────────────────────────

/**
 * Lines that emit the exported HttpError class into a generated router file.
 * Services throw `new HttpError(404, 'Not found')` and the generated router
 * catches it, returning the matching HTTP status instead of a generic 500.
 */
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

// ── Zod import helpers ────────────────────────────────────────────────────────

/**
 * Returns true when any operation in the list generates param validation code
 * that requires Zod (path format validation, required/typed query params, or header params).
 */
function operationsNeedZodForParams(operations: RouteOperation[]): boolean {
  for (const op of operations) {
    if (op.pathParamValidations.length > 0) return true
    if (queryParamsNeedValidation(op.queryParams)) return true
    if (op.headerParams.length > 0) return true
  }
  return false
}

// ── Express router generator ──────────────────────────────────────────────────

// fallow-ignore-next-line complexity
export function generateExpressRouter(
  spec: OpenAPIV3_1.Document,
  options?: RouterOptions
): GeneratedFile {
  const serviceName = deriveServiceName(spec)
  const operations = collectOperations(spec)
  const { sortedBodyTypes, usedSchemaNames, needsZod } = collectGeneratorSetup(operations, options)

  const lines: string[] = []
  lines.push('// This file is auto-generated. Do not edit manually.')
  lines.push(
    '// Express: apply express.json() middleware before mounting this router so req.body is populated.'
  )
  lines.push('')
  lines.push("import { Router } from 'express'")
  lines.push("import type { Request, Response } from 'express'")
  if (sortedBodyTypes.length > 0) {
    lines.push(`import type { ${sortedBodyTypes.join(', ')} } from './models.js'`)
  }
  lines.push(`import type { ${serviceName} } from './service.js'`)
  if (needsZod) {
    lines.push(`import { z } from 'zod'`)
  }
  if (usedSchemaNames.size > 0 && options?.schemaImportPath !== undefined) {
    const sortedUsedSchemas = Array.from(usedSchemaNames).sort()
    lines.push(`import { ${sortedUsedSchemas.join(', ')} } from '${options.schemaImportPath}'`)
  }
  lines.push('')
  for (const l of httpErrorClassLines()) lines.push(l)
  lines.push('')
  lines.push(`export function createRouter(service: ${serviceName}): Router {`)
  lines.push('  const router = Router()')
  lines.push('')

  for (const op of operations) {
    lines.push(buildExpressRouteHandler(op, '  ', options?.schemaNames))
    lines.push('')
  }

  lines.push('  return router')
  lines.push('}')
  lines.push('')

  return {
    filename: 'router.ts',
    content: lines.join('\n'),
  }
}

// ── Fastify router generator ──────────────────────────────────────────────────

// fallow-ignore-next-line complexity
export function generateFastifyRouter(
  spec: OpenAPIV3_1.Document,
  options?: RouterOptions
): GeneratedFile {
  const serviceName = deriveServiceName(spec)
  const operations = collectOperations(spec)
  const { sortedBodyTypes, usedSchemaNames, needsZod } = collectGeneratorSetup(operations, options)

  const lines: string[] = []
  lines.push('// This file is auto-generated. Do not edit manually.')
  lines.push('')
  lines.push("import type { FastifyInstance } from 'fastify'")
  if (sortedBodyTypes.length > 0) {
    lines.push(`import type { ${sortedBodyTypes.join(', ')} } from './models.js'`)
  }
  lines.push(`import type { ${serviceName} } from './service.js'`)
  if (needsZod) {
    lines.push(`import { z } from 'zod'`)
  }
  if (usedSchemaNames.size > 0 && options?.schemaImportPath !== undefined) {
    const sortedUsedSchemas = Array.from(usedSchemaNames).sort()
    lines.push(`import { ${sortedUsedSchemas.join(', ')} } from '${options.schemaImportPath}'`)
  }
  lines.push('')
  for (const l of httpErrorClassLines()) lines.push(l)
  lines.push('')
  lines.push(`export function createRouter(app: FastifyInstance, service: ${serviceName}): void {`)

  for (const op of operations) {
    lines.push('')
    lines.push(buildFastifyRouteHandler(op, '  ', options?.schemaNames))
  }

  lines.push('}')
  lines.push('')

  return {
    filename: 'router.ts',
    content: lines.join('\n'),
  }
}

// ── Hono router generator ─────────────────────────────────────────────────────

// fallow-ignore-next-line complexity
export function generateRouter(spec: OpenAPIV3_1.Document, options?: RouterOptions): GeneratedFile {
  const serviceName = deriveServiceName(spec)
  const operations = collectOperations(spec)
  const { sortedBodyTypes, usedSchemaNames, needsZod } = collectGeneratorSetup(operations, options)

  const lines: string[] = []
  lines.push('// This file is auto-generated. Do not edit manually.')
  lines.push('')
  lines.push("import { Hono } from 'hono'")
  if (sortedBodyTypes.length > 0) {
    lines.push(`import type { ${sortedBodyTypes.join(', ')} } from './models.js'`)
  }
  lines.push(`import type { ${serviceName} } from './service.js'`)
  if (needsZod) {
    lines.push(`import { z } from 'zod'`)
  }
  if (usedSchemaNames.size > 0 && options?.schemaImportPath !== undefined) {
    const sortedUsedSchemas = Array.from(usedSchemaNames).sort()
    lines.push(`import { ${sortedUsedSchemas.join(', ')} } from '${options.schemaImportPath}'`)
  }
  lines.push('')
  for (const l of httpErrorClassLines()) lines.push(l)
  lines.push('')
  lines.push(`export function createRouter(service: ${serviceName}): Hono {`)
  lines.push('  const app = new Hono()')
  lines.push('')

  for (const op of operations) {
    lines.push(buildRouteHandler(op, '  ', options?.schemaNames))
    lines.push('')
  }

  lines.push('  return app')
  lines.push('}')
  lines.push('')

  return {
    filename: 'router.ts',
    content: lines.join('\n'),
  }
}
