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
  type QueryParam,
  getQueryParams,
  type BodyInfo,
  getBodyInfo,
} from './shared.js'

type OperationObject = OpenAPIV3_1.OperationObject
type ReferenceObject = OpenAPIV3_1.ReferenceObject
type ResponseObject = OpenAPIV3_1.ResponseObject

interface ReturnInfo {
  typeName: string | undefined
  isArray: boolean
  isVoid: boolean
}

function getReturnInfo(operation: OperationObject): ReturnInfo {
  const responses = operation.responses as
    | Record<string, ResponseObject | ReferenceObject>
    | undefined
  if (responses === undefined) return { typeName: undefined, isArray: false, isVoid: true }

  // Check 2xx responses in priority order: 200, 201, then any other 2xx with content.
  // 204 (void) and multi-2xx cases are handled below.
  const twoxxCodes = ['200', '201', ...Object.keys(responses).filter(
    (k) => /^2\d\d$/.test(k) && k !== '200' && k !== '201' && k !== '204'
  )]
  for (const code of twoxxCodes) {
    const response = responses[code]
    if (response === undefined) continue
    if (isRef(response)) continue

    const resp = response as ResponseObject
    const content = resp.content as
      | Record<string, { schema?: OpenAPIV3_1.SchemaObject | ReferenceObject }>
      | undefined
    if (content === undefined) continue

    const jsonContent = content['application/json']
    if (jsonContent === undefined || jsonContent.schema === undefined) continue

    const schema = jsonContent.schema
    if (isRef(schema)) {
      return {
        typeName: refToName((schema as ReferenceObject).$ref),
        isArray: false,
        isVoid: false,
      }
    }

    const s = schema as OpenAPIV3_1.SchemaObject
    if (s.type === 'array') {
      const items = s.items as OpenAPIV3_1.SchemaObject | ReferenceObject | undefined
      if (items !== undefined && isRef(items)) {
        return {
          typeName: refToName((items as ReferenceObject).$ref),
          isArray: true,
          isVoid: false,
        }
      }
      return { typeName: undefined, isArray: true, isVoid: false }
    }

    return { typeName: undefined, isArray: false, isVoid: false }
  }

  // Check for 204 explicitly
  if (responses['204'] !== undefined) {
    return { typeName: undefined, isArray: false, isVoid: true }
  }

  return { typeName: undefined, isArray: false, isVoid: true }
}

function buildReturnType(info: ReturnInfo): string {
  if (info.isVoid) return 'Promise<void>'
  if (info.typeName !== undefined) {
    return info.isArray ? `Promise<${info.typeName}[]>` : `Promise<${info.typeName}>`
  }
  return info.isArray ? 'Promise<unknown[]>' : 'Promise<unknown>'
}

interface OperationInfo {
  methodName: string
  httpMethod: SupportedMethod
  path: string
  pathParams: string[]
  queryParams: QueryParam[]
  bodyInfo: BodyInfo | undefined
  returnInfo: ReturnInfo
}

function collectOperations(spec: OpenAPIV3_1.Document): OperationInfo[] {
  const paths = spec.paths as Record<string, Record<string, OperationObject>> | undefined
  if (paths === undefined) return []

  const operations: OperationInfo[] = []

  for (const [path, pathItem] of Object.entries(paths)) {
    for (const method of SUPPORTED_METHODS) {
      const operation = pathItem[method] as OperationObject | undefined
      if (operation === undefined) continue

      const methodName = deriveMethodName(operation.operationId, method, path)
      const pathParams = extractPathParamsFromPath(path)
      const queryParams = getQueryParams(operation, spec)
      const bodyInfo = getBodyInfo(operation)
      const returnInfo = getReturnInfo(operation)

      operations.push({
        methodName,
        httpMethod: method,
        path,
        pathParams,
        queryParams,
        bodyInfo,
        returnInfo,
      })
    }
  }

  return operations
}

function buildMethodSignature(op: OperationInfo): string {
  const args: string[] = []

  // Path params as positional string args (in template order).
  // Raw names are sanitized to valid TypeScript identifiers here.
  for (const p of op.pathParams) {
    args.push(`${sanitizeOperationId(p)}: string`)
  }

  // Body arg
  if (op.bodyInfo !== undefined) {
    const typeName = op.bodyInfo.typeName ?? 'unknown'
    args.push(`body: ${typeName}`)
  }

  // Query params as optional object
  if (op.queryParams.length > 0) {
    const allOptional = op.queryParams.every((q) => !q.required)
    const fields = op.queryParams
      .map((q) => `${q.name}${q.required ? '' : '?'}: ${q.tsType}`)
      .join('; ')
    const paramsToken = allOptional ? 'params?' : 'params'
    args.push(`${paramsToken}: { ${fields} }`)
  }

  const returnType = buildReturnType(op.returnInfo)
  const argStr = args.join(', ')
  return `${op.methodName}(${argStr}): ${returnType}`
}

export function generateService(spec: OpenAPIV3_1.Document): GeneratedFile {
  const serviceName = deriveServiceName(spec)
  const operations = collectOperations(spec)

  // Collect import types: body types and return types that are named identifiers
  const importTypes = new Set<string>()
  for (const op of operations) {
    if (op.bodyInfo?.typeName !== undefined) {
      importTypes.add(op.bodyInfo.typeName)
    }
    if (op.returnInfo.typeName !== undefined) {
      importTypes.add(op.returnInfo.typeName)
    }
  }

  const sortedImports = Array.from(importTypes).sort()

  const lines: string[] = []
  lines.push('// This file is auto-generated. Do not edit manually.')
  lines.push('')

  if (sortedImports.length > 0) {
    lines.push(`import type { ${sortedImports.join(', ')} } from './models.js'`)
    lines.push('')
  }

  lines.push(`export interface ${serviceName} {`)

  for (const op of operations) {
    lines.push(`  /** ${op.httpMethod.toUpperCase()} ${op.path} */`)
    lines.push(`  ${buildMethodSignature(op)}`)
  }

  lines.push('}')
  lines.push('')

  return {
    filename: 'service.ts',
    content: lines.join('\n'),
  }
}
