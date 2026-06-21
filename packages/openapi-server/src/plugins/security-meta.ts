import type { OpenAPIV3_1 } from 'openapi-types'

/**
 * Helpers for emitting operation security metadata into generated Fastify output.
 * Shared by the route emitter (config.security) and the service emitter (@security
 * JSDoc) so the two parallel emitters derive identical security data.
 */

/**
 * Escape a string so it cannot break out of a JSDoc comment block.
 * The closing sequence for JSDoc is the only dangerous escape; newlines are
 * replaced with a space to keep the tag on a single line.
 */
export function escapeJsDocString(value: string): string {
  return value.replace(/\*\//g, '*\\/').replace(/\r?\n/g, ' ')
}

/**
 * Derive the effective security requirements for an operation.
 * operation.security overrides the global spec.security when present.
 * Each SecurityRequirementObject (Record<string, string[]>) is expanded into
 * one { scheme, scopes } entry per key.
 */
export function deriveEffectiveSecurity(
  operation: OpenAPIV3_1.OperationObject,
  spec: OpenAPIV3_1.Document
): Array<{ scheme: string; scopes: string[] }> {
  const rawSecurity =
    (operation.security as Array<Record<string, string[]>> | undefined) ??
    (spec.security as Array<Record<string, string[]>> | undefined)
  if (rawSecurity === undefined || rawSecurity.length === 0) return []
  const result: Array<{ scheme: string; scopes: string[] }> = []
  for (const req of rawSecurity) {
    for (const [scheme, scopes] of Object.entries(req)) {
      result.push({ scheme, scopes: Array.isArray(scopes) ? scopes : [] })
    }
  }
  return result
}
