import type { FieldError } from './types.js'
import { isObject } from './utils.js'

/**
 * Simple flat object format:
 * { "field": "email", "message": "Invalid email" }
 */
export function tryParseFlatObject(
  body: Record<string, unknown>,
  fallbackField: string,
  transformField: (field: string) => string
): FieldError[] | null {
  const rawField = typeof body['field'] === 'string' ? body['field'] : null
  const message = typeof body['message'] === 'string' ? body['message'] : null
  if (message === null) return null
  const field = rawField !== null ? rawField : fallbackField
  return [{ field: transformField(field), message }]
}

/**
 * Array of simple flat objects:
 * [{ "field": "email", "message": "Invalid email" }]
 */
export function tryParseFlatArray(
  body: unknown[],
  fallbackField: string,
  transformField: (field: string) => string
): FieldError[] | null {
  const result: FieldError[] = []
  for (const item of body) {
    if (!isObject(item)) continue
    const rawField = typeof item['field'] === 'string' ? item['field'] : fallbackField
    const message = typeof item['message'] === 'string' ? item['message'] : null
    if (message === null) continue
    result.push({ field: transformField(rawField), message })
  }
  return result.length > 0 ? result : null
}
