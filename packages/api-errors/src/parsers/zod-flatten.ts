import type { FieldError, ParsedErrors } from './types.js'
import { isObject, isStringArray } from './utils.js'

/**
 * Zod `.flatten()` output shape:
 * { fieldErrors: { email: ["must not be blank"], name: ["required"] }, formErrors: ["Global error"] }
 *
 * Guard: body must have at least one of `fieldErrors` or `formErrors`.
 * `fieldErrors` must be a plain object (not null, not array).
 * `formErrors` must be an array of strings.
 */
export function tryParseZodFlatten(body: Record<string, unknown>): ParsedErrors | null {
  const rawFieldErrors = body['fieldErrors']
  const rawFormErrors = body['formErrors']

  const hasFieldErrors = rawFieldErrors !== undefined
  const hasFormErrors = rawFormErrors !== undefined

  // At least one key must be present.
  if (!hasFieldErrors && !hasFormErrors) return null

  // If fieldErrors is present, it must be a plain object (not null, not array).
  if (hasFieldErrors && !isObject(rawFieldErrors)) return null

  // If formErrors is present, it must be a string array (empty is allowed).
  if (hasFormErrors && !isStringArray(rawFormErrors)) return null

  const fieldErrors: FieldError[] = []

  if (hasFieldErrors && isObject(rawFieldErrors)) {
    for (const [field, messages] of Object.entries(rawFieldErrors)) {
      if (isStringArray(messages)) {
        for (const message of messages) {
          fieldErrors.push({ field, message })
        }
      }
    }
  }

  const formErrors: string[] = isStringArray(rawFormErrors) ? (rawFormErrors as string[]) : []

  return { fieldErrors, formErrors }
}
