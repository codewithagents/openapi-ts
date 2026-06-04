export type { FieldError, ParsedErrors, ErrorFormat, CustomParser } from './parsers/types.js'
import type { FieldError, ErrorFormat, CustomParser } from './parsers/types.js'
import { finalize } from './parsers/utils.js'
import { unwrapBody } from './parsers/unwrap.js'
import { matchBody } from './parsers/dispatch.js'
import { isObject } from './parsers/utils.js'

/**
 * Rich result returned by `extractErrors`.
 */
export interface ExtractResult {
  /**
   * Field-level errors extracted from the response body.
   */
  fieldErrors: FieldError[]
  /**
   * Non-field (global/form-level) error messages.
   * These are messages that could not be attributed to a specific field,
   * such as RFC 9457 `detail`, JSON:API errors without a source pointer,
   * or violations/invalid-params entries without a field name.
   */
  formErrors: string[]
  /**
   * The format that was recognized.
   * `null` when no supported format matched (both `fieldErrors` and `formErrors` are empty).
   *
   * Use this to distinguish "unrecognized shape" from "recognized but genuinely no errors".
   */
  format: ErrorFormat | null
}

/**
 * Options for mapApiErrors and extractFieldErrors.
 */
export interface MapApiErrorsOptions {
  /**
   * Fallback field name when no field can be determined from the error.
   * Defaults to 'root'.
   */
  fallbackField?: string
  /**
   * Optional transform applied to every field name before it is returned.
   * Useful for mapping backend camelCase field names to nested React Hook Form
   * paths, e.g. `"addressCity"` to `"address.city"`.
   */
  transformField?: (field: string) => string
  /**
   * Restrict field error extraction to specific HTTP status codes.
   * If provided, the error's `status` (or `response.status`) is checked first.
   * If the status is not in this list, `extractFieldErrors` returns `[]` immediately
   * without attempting to parse the body.
   *
   * Useful to avoid trying to extract field errors from 404 or 500 responses.
   *
   * @example
   * extractFieldErrors(err, { statusCodes: [422] })
   */
  statusCodes?: number[]
  /**
   * Optional message resolver / i18n hook.
   * Called for every error message (both field errors and form errors) before
   * the message is included in the result. Return a replacement string to
   * translate or reformat the message.
   *
   * `field` is `null` for global/form-level errors.
   *
   * @example
   * resolveMessage: (msg, field) => t(`errors.${msg}`) ?? msg
   */
  resolveMessage?: (message: string, field: string | null) => string
  /**
   * Custom parsers to try before the built-in parsers.
   * Parsers are tried in order; the first one that returns a non-null result wins.
   * Return `null` to indicate "not recognized by this parser".
   *
   * Custom parsers receive the already-unwrapped body (after ApiError / Axios
   * unwrapping), so they do not need to re-implement body unwrapping.
   */
  parsers?: ReadonlyArray<CustomParser>
}

// ---------------------------------------------------------------------------
// Status filtering helper
// ---------------------------------------------------------------------------

function extractStatus(error: unknown): number | undefined {
  if (!isObject(error)) return undefined
  const e = error as Record<string, unknown>
  if (typeof e['status'] === 'number') return e['status'] as number
  if (isObject(e['response'])) {
    const r = e['response'] as Record<string, unknown>
    if (typeof r['status'] === 'number') return r['status'] as number
  }
  return undefined
}

/** True when the error's status code is present but not in the allowed list. */
function isStatusBlocked(error: unknown, options: MapApiErrorsOptions | undefined): boolean {
  if (!options?.statusCodes) return false
  const status = extractStatus(error)
  return status !== undefined && !options.statusCodes.includes(status)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract errors from an unknown API error response, returning a rich result
 * that includes field errors, form-level (non-field) errors, and the matched format.
 *
 * Use `format` to distinguish "unrecognized shape" (format is null) from
 * "recognized but genuinely no errors" (format is non-null, both arrays empty).
 *
 * `formErrors` contains global / non-field error messages that cannot be
 * attributed to a specific field (e.g. RFC 9457 `detail`, JSON:API errors
 * without a source pointer, violations without a field name).
 *
 * Supports all formats recognized by `extractFieldErrors`, plus:
 * - `violations: [{ field, message }]`
 * - `"invalid-params": [{ name, reason }]`
 * - JSON:API `errors: [{ source: { pointer }, detail }]`
 * - Laravel / DRF top-level field map `{ field: ["msg", ...] }`
 *
 * Use `options.parsers` to register custom parsers for application-specific shapes.
 *
 * Never throws.
 */
export function extractErrors(error: unknown, options?: MapApiErrorsOptions): ExtractResult {
  const fallbackField = options?.fallbackField ?? 'root'
  const transformField = options?.transformField ?? ((f: string) => f)
  const resolveMessage = options?.resolveMessage

  try {
    if (isStatusBlocked(error, options)) return { fieldErrors: [], formErrors: [], format: null }

    const match = matchBody(unwrapBody(error), fallbackField, transformField, options?.parsers)
    if (match === null) return { fieldErrors: [], formErrors: [], format: null }

    const { parsed, format } = match
    const fieldErrors = finalize(
      resolveMessage
        ? parsed.fieldErrors.map((e) => ({
            field: e.field,
            message: resolveMessage(e.message, e.field),
          }))
        : parsed.fieldErrors
    )
    const formErrors = resolveMessage
      ? parsed.formErrors.map((m) => resolveMessage(m, null))
      : parsed.formErrors
    return { fieldErrors, formErrors, format }
  } catch {
    return { fieldErrors: [], formErrors: [], format: null }
  }
}

/**
 * Extract normalized field errors from an unknown API error response.
 *
 * Supports:
 * - RFC 7807 / RFC 9457 Problem Details (Spring Boot 3+) with `errors` map
 * - RFC 9457 top-level `detail` field as a root-level error
 * - RFC 9457 `violations: [{ field, message }]` array
 * - RFC 9457 `"invalid-params": [{ name, reason }]` array
 * - JSON:API `errors: [{ source: { pointer }, detail }]` array
 * - Laravel / DRF top-level field map `{ field: ["msg", ...] }`
 * - Spring Boot default validation format (array of `{ field, defaultMessage }`)
 * - Simple flat `{ field, message }` object
 * - Array of `{ field, message }` objects
 *
 * Use `statusCodes` to restrict extraction to specific HTTP status codes.
 *
 * For a richer result that includes non-field errors and the matched format,
 * use `extractErrors` instead.
 *
 * Never throws — returns an empty array for unrecognized shapes.
 */
export function extractFieldErrors(error: unknown, options?: MapApiErrorsOptions): FieldError[] {
  const fallbackField = options?.fallbackField ?? 'root'
  const transformField = options?.transformField ?? ((f: string) => f)

  try {
    if (isStatusBlocked(error, options)) return []

    const match = matchBody(unwrapBody(error), fallbackField, transformField, options?.parsers)
    if (match === null) return []

    const { parsed } = match
    // In the legacy API, form-level errors fall back to fallbackField instead of
    // being returned in a separate channel.
    const fallbackErrors: FieldError[] = parsed.formErrors.map((message) => ({
      field: transformField(fallbackField),
      message,
    }))
    return finalize([...parsed.fieldErrors, ...fallbackErrors])
  } catch {
    return []
  }
}

/**
 * React Hook Form adapter.
 *
 * Extracts field errors from an unknown API error response and calls
 * React Hook Form's `setError` for each one.
 *
 * @example
 * ```ts
 * try {
 *   await submitForm(data)
 * } catch (error) {
 *   mapApiErrors(error, setError)
 * }
 * ```
 */
export function mapApiErrors(
  error: unknown,
  setError: (field: string, error: { type: string; message: string }) => void,
  options?: MapApiErrorsOptions
): void {
  const fieldErrors = extractFieldErrors(error, options)
  for (const { field, message } of fieldErrors) {
    setError(field, { type: 'server', message })
  }
}
