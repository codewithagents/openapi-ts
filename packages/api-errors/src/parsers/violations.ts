import type { ParsedErrors } from './types.js'
import { parseKeyedArray } from './utils.js'

/**
 * RFC 9457 violations array (also used by some Spring Boot setups):
 * { "violations": [{ "field": "email", "message": "must not be blank" }] }
 */
export function tryParseViolations(body: Record<string, unknown>): ParsedErrors | null {
  const { violations } = body
  if (!Array.isArray(violations)) return null
  return parseKeyedArray(violations, 'field', 'message')
}
