/**
 * Normalized representation of a single field-level error.
 */
export interface FieldError {
  field: string
  message: string
}

/**
 * Raw parse result used internally and returned by custom parsers.
 * Both arrays may be empty if the shape was recognized but contained no errors.
 */
export interface ParsedErrors {
  fieldErrors: FieldError[]
  formErrors: string[]
}

/**
 * The format/shape that was recognized when parsing an error body.
 *
 * - `'rfc7807-map'`          - RFC 7807 / RFC 9457 `errors` map: `{ errors: { field: [...] } }`
 * - `'spring-array'`         - Spring Boot array: `{ errors: [{ field, defaultMessage }] }`
 * - `'violations'`           - RFC 9457 / Spring `violations` array: `{ violations: [{ field, message }] }`
 * - `'invalid-params'`       - RFC 9457 `invalid-params` array: `{ "invalid-params": [{ name, reason }] }`
 * - `'json-api'`             - JSON:API errors array: `{ errors: [{ source: { pointer }, detail }] }`
 * - `'graphql-extensions'`   - GraphQL errors array: `{ errors: [{ message, extensions?: { field?, path? } }] }`
 * - `'zod-flatten'`          - Zod flatten shape: `{ fieldErrors: { field: [...] }, formErrors: [...] }`
 * - `'laravel-drf'`          - Laravel / DRF top-level field map: `{ field: ["msg1", ...] }`
 * - `'flat-object'`          - Simple flat object: `{ field, message }`
 * - `'flat-array'`           - Array of flat objects: `[{ field, message }]`
 * - `'rfc9457-detail'`       - RFC 9457 top-level `detail` string (last-resort fallback)
 * - `'custom'`               - Matched a caller-provided custom parser
 */
export type ErrorFormat =
  | 'rfc7807-map'
  | 'spring-array'
  | 'violations'
  | 'invalid-params'
  | 'json-api'
  | 'graphql-extensions'
  | 'zod-flatten'
  | 'laravel-drf'
  | 'flat-object'
  | 'flat-array'
  | 'rfc9457-detail'
  | 'custom'

/**
 * A custom parser that callers can register to handle application-specific
 * error shapes not covered by the built-in parsers.
 *
 * Return `null` to indicate "not recognized" and let the next parser try.
 * Return a `ParsedErrors` object (even if both arrays are empty) to signal
 * that this shape was recognized.
 */
export interface CustomParser {
  (body: unknown): ParsedErrors | null
}
