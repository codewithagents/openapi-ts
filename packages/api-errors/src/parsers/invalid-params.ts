import type { ParsedErrors } from './types.js'
import { parseKeyedArray } from './utils.js'

/**
 * RFC 9457 invalid-params array:
 * { "invalid-params": [{ "name": "email", "reason": "must not be blank" }] }
 */
export function tryParseInvalidParams(body: Record<string, unknown>): ParsedErrors | null {
  const invalidParams = body['invalid-params']
  if (!Array.isArray(invalidParams)) return null
  return parseKeyedArray(invalidParams, 'name', 'reason')
}
