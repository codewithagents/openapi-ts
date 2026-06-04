import type { FieldError } from './types.js'
import { isObject, isStringArray } from './utils.js'

/**
 * RFC 7807 Problem Details (Spring Boot 3+ default):
 * { "errors": { "email": ["must not be blank"], "name": ["too short"] } }
 */
export function tryParseRfc7807(
  body: Record<string, unknown>,
  transformField: (field: string) => string
): FieldError[] | null {
  const { errors } = body
  if (!isObject(errors)) return null

  const result: FieldError[] = []
  for (const [rawField, messages] of Object.entries(errors)) {
    const field = transformField(rawField)
    if (isStringArray(messages)) {
      for (const message of messages) result.push({ field, message })
    } else if (typeof messages === 'string') {
      result.push({ field, message: messages })
    }
    // null / unknown value shapes are skipped — no partial/garbage errors
  }
  return result.length > 0 ? result : null
}
