import type { GeneratedFile } from 'openapi-zod-ts'
import { dirname, join, relative, resolve } from 'node:path'
import type { ServerConfig } from '../config.js'

/**
 * Emit `_shared/errors.ts`: the single shared module containing the HttpError class.
 * All generated routers (Fastify, Hono, Express) import HttpError from this shared file
 * instead of inlining the class. Emitting once per generation run guarantees that
 * `err instanceof HttpError` works across multiple routers mounted in the same server.
 */
export function emitSharedErrorsFile(): GeneratedFile {
  const lines: string[] = []
  lines.push('// This file is auto-generated. Do not edit manually.')
  lines.push('')
  lines.push('export class HttpError extends Error {')
  lines.push('  constructor(public readonly status: number, message: string) {')
  lines.push('    super(message)')
  lines.push("    this.name = 'HttpError'")
  lines.push('  }')
  lines.push('}')
  lines.push('')
  return {
    filename: '_shared/errors.ts',
    content: lines.join('\n'),
  }
}

/**
 * Derive the absolute path to the shared `_shared/` directory given all project configs.
 *
 * Rules:
 * - If any config has `shared_output` set, that value (resolved against cwd) wins.
 *   The first non-empty `shared_output` across all configs is used.
 * - Single project: commonParent = resolvedOutput (the output dir itself),
 *   so shared = `<output>/_shared`.
 * - Multiple projects: commonParent = longest common directory prefix of all resolved
 *   output paths, so shared = `<commonParent>/_shared`.
 */
export function deriveSharedDir(cwd: string, configs: ServerConfig[]): string {
  // Explicit override wins.
  const explicitOverride = configs.find((c) => c.shared_output !== undefined)?.shared_output
  if (explicitOverride !== undefined) {
    return resolve(cwd, explicitOverride)
  }

  const resolvedOutputs = configs.map((c) => resolve(cwd, c.output))

  if (resolvedOutputs.length === 1) {
    // Single project: shared lives inside the single output dir.
    return join(resolvedOutputs[0]!, '_shared')
  }

  // Multiple projects: find the longest common directory prefix.
  const commonParent = findCommonParent(resolvedOutputs)
  return join(commonParent, '_shared')
}

/**
 * Compute the relative import path from a project's output directory to
 * the `_shared/errors.js` module in the shared directory.
 *
 * Result always ends in `/_shared/errors.js` relative to the outputDir.
 * It is normalized to use forward slashes and always starts with `./` or `../`.
 */
export function sharedErrorsImportPath(outputDir: string, sharedDir: string): string {
  const rel = relative(outputDir, join(sharedDir, 'errors.js')).replace(/\\/g, '/')
  return rel.startsWith('.') ? rel : `./${rel}`
}

/**
 * Find the longest common directory prefix of a list of absolute paths.
 * Each segment must match exactly; the first differing segment ends the prefix.
 *
 * Examples:
 *   ['/gen/public', '/gen/admin']  → '/gen'
 *   ['/a/b/c', '/a/b/d']          → '/a/b'
 *   ['/a/x', '/b/y']              → '/'
 */
export function findCommonParent(paths: string[]): string {
  if (paths.length === 0) return '.'
  if (paths.length === 1) {
    const p = paths[0]!
    return dirname(p)
  }

  const sep = '/'
  // Normalize to forward slashes and split.
  const segmented = paths.map((p) => p.replace(/\\/g, sep).split(sep))
  const minLen = Math.min(...segmented.map((s) => s.length))

  const common: string[] = []
  for (let i = 0; i < minLen; i++) {
    const seg = segmented[0]![i]!
    if (segmented.every((s) => s[i] === seg)) {
      common.push(seg)
    } else {
      break
    }
  }

  // The loop stops at the first divergent segment, so `common` already holds the
  // common prefix directory path. Join it back into a path.
  const result = common.join(sep)
  // On Unix an absolute path starts with '/', so join gives '' for root; re-add '/'.
  return result === '' ? '/' : result
}
