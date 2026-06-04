import type { FieldError } from './types.js'
import { isObject } from './utils.js'

/**
 * Spring Boot default validation format (pre-3):
 * { "errors": [{ "field": "email", "defaultMessage": "must not be blank" }] }
 */
export function tryParseSpringArray(
  body: Record<string, unknown>,
  fallbackField: string,
  transformField: (field: string) => string
): FieldError[] | null {
  const { errors } = body
  if (!Array.isArray(errors)) return null

  const result: FieldError[] = []
  for (const item of errors) {
    if (!isObject(item)) continue
    const rawField = typeof item['field'] === 'string' ? item['field'] : fallbackField
    const message =
      typeof item['defaultMessage'] === 'string'
        ? item['defaultMessage']
        : typeof item['message'] === 'string'
          ? item['message']
          : 'Unknown error'
    result.push({ field: transformField(rawField), message })
  }
  return result.length > 0 ? result : null
}
