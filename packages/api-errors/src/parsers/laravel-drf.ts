import type { FieldError, ParsedErrors } from './types.js'
import { isStringArray } from './utils.js'

/** Keys that belong to other parsers and disqualify a body from Laravel/DRF matching. */
const LARAVEL_RESERVED_KEYS = new Set([
  'errors',
  'violations',
  'invalid-params',
  'field',
  'message',
  'detail',
  'title',
  'status',
  'type',
  // Zod flatten shape keys — prevent laravel-drf from consuming zod-flatten bodies.
  'fieldErrors',
  'formErrors',
])

function hasReservedLaravelKey(entries: [string, unknown][]): boolean {
  return entries.some(([k]) => LARAVEL_RESERVED_KEYS.has(k))
}

/**
 * Laravel / DRF top-level field-to-messages map:
 * { "email": ["must not be blank", "invalid format"], "name": ["required"] }
 *
 * Guard: at least one value must be a non-empty string array, and the body
 * must not use keys owned by other parsers.
 */
export function tryParseLaravelDrf(body: Record<string, unknown>): ParsedErrors | null {
  const entries = Object.entries(body)
  if (entries.length === 0 || hasReservedLaravelKey(entries)) return null

  // Require at least one non-empty string array to distinguish from generic flat objects
  if (!entries.some(([, v]) => isStringArray(v) && (v as string[]).length > 0)) return null

  const fieldErrors: FieldError[] = []
  for (const [rawField, messages] of entries) {
    if (isStringArray(messages)) {
      for (const message of messages) fieldErrors.push({ field: rawField, message })
    } else if (typeof messages === 'string') {
      fieldErrors.push({ field: rawField, message: messages })
    }
  }
  return fieldErrors.length > 0 ? { fieldErrors, formErrors: [] } : null
}
