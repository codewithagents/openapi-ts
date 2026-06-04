import type { FieldError, ParsedErrors } from './types.js'
import { isObject } from './utils.js'

/**
 * JSON:API errors array:
 * { "errors": [{ "source": { "pointer": "/data/attributes/email" }, "detail": "..." }] }
 *
 * Errors with a source pointer map to field errors.
 * Errors without a source pointer (or with a pointer of "/") map to form errors.
 *
 * IMPORTANT: this parser must run BEFORE tryParseSpringArray because a JSON:API
 * body also has an `errors` array and would silently match the Spring-array parser
 * via the defaultMessage fallback.
 */
export function tryParseJsonApi(body: Record<string, unknown>): ParsedErrors | null {
  const { errors } = body
  if (!Array.isArray(errors) || !isJsonApiShape(errors)) return null

  const fieldErrors: FieldError[] = []
  const formErrors: string[] = []
  for (const item of errors) {
    if (!isObject(item)) continue
    classifyJsonApiItem(item, fieldErrors, formErrors)
  }
  return { fieldErrors, formErrors }
}

/** True when at least one item looks like a JSON:API error object (not Spring). */
function isJsonApiShape(errors: unknown[]): boolean {
  return errors.some(
    (item) =>
      isObject(item) &&
      (isObject(item['source']) || typeof item['detail'] === 'string') &&
      !('field' in item) &&
      !('defaultMessage' in item)
  )
}

/** Push one JSON:API error item into the appropriate bucket. */
function classifyJsonApiItem(
  item: Record<string, unknown>,
  fieldErrors: FieldError[],
  formErrors: string[]
): void {
  const detail = typeof item['detail'] === 'string' ? item['detail'] : null
  const message = detail ?? 'Unknown error'
  const source = item['source']

  if (isObject(source) && typeof source['pointer'] === 'string') {
    const field = pointerToField(source['pointer'] as string)
    if (field !== null) {
      fieldErrors.push({ field, message })
    } else if (detail !== null) {
      formErrors.push(detail)
    }
  } else if (detail !== null) {
    formErrors.push(detail)
  }
}

/**
 * Convert a JSON Pointer (RFC 6901) used in JSON:API source.pointer to a
 * dot-separated field path for form use.
 *
 * `/data/attributes/email`        -> `email`
 * `/data/attributes/address/city` -> `address.city`
 * `/data/relationships/author`    -> `author`
 * `/email`                        -> `email`
 * `/`                             -> null (root, non-field)
 * ``                              -> null
 */
function pointerToField(pointer: string): string | null {
  if (!pointer || pointer === '/') return null

  const segments = pointer
    .replace(/^\//, '')
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
    .filter(Boolean)

  return segments.length > 0 ? resolveJsonApiSegments(segments) : null
}

/** Strip well-known JSON:API structural prefixes and join as dot-path. */
function resolveJsonApiSegments(segments: string[]): string | null {
  if (segments[0] !== 'data') return segments.join('.')
  if (segments[1] === 'attributes') {
    const rest = segments.slice(2)
    return rest.length > 0 ? rest.join('.') : null
  }
  if (segments[1] === 'relationships' && segments.length > 2) {
    return segments.slice(2).join('.')
  }
  return segments.join('.')
}
