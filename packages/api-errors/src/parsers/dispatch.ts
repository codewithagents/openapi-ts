import type { CustomParser, ErrorFormat, ParsedErrors } from './types.js'
import { isObject } from './utils.js'
import { tryParseViolations } from './violations.js'
import { tryParseInvalidParams } from './invalid-params.js'
import { tryParseJsonApi } from './json-api.js'
import { tryParseRfc7807 } from './rfc7807.js'
import { tryParseSpringArray } from './spring.js'
import { tryParseGraphqlExtensions } from './graphql-extensions.js'
import { tryParseLaravelDrf } from './laravel-drf.js'
import { tryParseFlatObject, tryParseFlatArray } from './flat.js'
import { tryParseZodFlatten } from './zod-flatten.js'

/** Internal match result: parsed errors + the format that matched. */
export interface MatchResult {
  parsed: ParsedErrors
  format: ErrorFormat
}

/** Wrap a ParsedErrors result with its format tag, applying transformField to field names. */
function wrapMatch(
  parsed: ParsedErrors,
  format: ErrorFormat,
  transformField: (f: string) => string
): MatchResult {
  return {
    parsed: {
      fieldErrors: parsed.fieldErrors.map((e) => ({
        field: transformField(e.field),
        message: e.message,
      })),
      formErrors: parsed.formErrors,
    },
    format,
  }
}

/**
 * Try all object-body parsers in priority order.
 * Returns the first match, or null if no parser recognized the shape.
 */
function matchObjectBody(
  body: Record<string, unknown>,
  fallbackField: string,
  transformField: (f: string) => string
): MatchResult | null {
  // Each thunk in this ordered list tries one parser and returns a MatchResult or null.
  const candidates: Array<() => MatchResult | null> = [
    () => {
      const r = tryParseViolations(body)
      return r && wrapMatch(r, 'violations', transformField)
    },
    () => {
      const r = tryParseInvalidParams(body)
      return r && wrapMatch(r, 'invalid-params', transformField)
    },
    () => {
      const r = tryParseJsonApi(body)
      return r && wrapMatch(r, 'json-api', transformField)
    },
    () => {
      const r = tryParseRfc7807(body, transformField)
      return r && { parsed: { fieldErrors: r, formErrors: [] }, format: 'rfc7807-map' as const }
    },
    () => {
      const r = tryParseGraphqlExtensions(body)
      return r && wrapMatch(r, 'graphql-extensions', transformField)
    },
    () => {
      const r = tryParseSpringArray(body, fallbackField, transformField)
      return r && { parsed: { fieldErrors: r, formErrors: [] }, format: 'spring-array' as const }
    },
    () => {
      const r = tryParseLaravelDrf(body)
      return r && wrapMatch(r, 'laravel-drf', transformField)
    },
    () => {
      const r = tryParseFlatObject(body, fallbackField, transformField)
      return r && { parsed: { fieldErrors: r, formErrors: [] }, format: 'flat-object' as const }
    },
    () => {
      const r = tryParseZodFlatten(body)
      return r && wrapMatch(r, 'zod-flatten', transformField)
    },
    () => {
      const detail = body['detail']
      return typeof detail === 'string'
        ? { parsed: { fieldErrors: [], formErrors: [detail] }, format: 'rfc9457-detail' as const }
        : null
    },
  ]

  for (const candidate of candidates) {
    const result = candidate()
    if (result !== null) return result
  }
  return null
}

/**
 * Run custom parsers (if any) before the built-in ones.
 * Returns the first match, or null to fall through.
 */
function tryCustomParsers(
  body: unknown,
  customParsers: ReadonlyArray<CustomParser>
): MatchResult | null {
  for (const parser of customParsers) {
    const parsed = parser(body)
    if (parsed !== null) return { parsed, format: 'custom' }
  }
  return null
}

/**
 * Dispatch an array body through the flat-array parser.
 */
function matchArrayBody(
  body: unknown[],
  fallbackField: string,
  transformField: (f: string) => string
): MatchResult | null {
  const flat = tryParseFlatArray(body, fallbackField, transformField)
  return flat ? { parsed: { fieldErrors: flat, formErrors: [] }, format: 'flat-array' } : null
}

/**
 * Run all parsers (custom, array, object) against an already-unwrapped body.
 * Returns the first match, or null if no parser recognized the shape.
 */
export function matchBody(
  body: unknown,
  fallbackField: string,
  transformField: (f: string) => string,
  customParsers: ReadonlyArray<CustomParser> | undefined
): MatchResult | null {
  if (customParsers?.length) {
    const custom = tryCustomParsers(body, customParsers)
    if (custom !== null) return custom
  }
  if (Array.isArray(body)) return matchArrayBody(body, fallbackField, transformField)
  if (!isObject(body)) return null
  return matchObjectBody(body, fallbackField, transformField)
}
