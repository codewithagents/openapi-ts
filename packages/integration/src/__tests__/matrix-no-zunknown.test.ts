/**
 * Matrix source-scan test: PRIMARY detector for the no-partial-unknown coverage net.
 *
 * This is the recursion-safe, depth-complete detector. Every construct in matrix.json
 * is concretely representable, so ANY occurrence of ` unknown` in models/service or
 * `z.unknown()` in schemas/router is a real generator bug (a RED CELL).
 *
 * Detection methodology:
 *   - generated-matrix/models.ts: type aliases and interfaces fully typed; scan for ` unknown`
 *   - generated-matrix/service.ts: Fastify service input facets and return types; scan for ` unknown`
 *   - generated-matrix/schemas.ts: Zod schemas; scan for `z.unknown()`
 *   - generated-matrix/router.ts: Fastify router; scan for `z.unknown()`
 *
 * The legit-unknown test below proves the detector has teeth: it confirms that
 * generated-matrix-legit/models.ts (from spec/matrix-legit-unknown.json which uses
 * additionalProperties:true and empty {}) DOES produce ` unknown`, which pins the intent
 * that these constructs are intentionally unknown.
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../..')

function read(relPath: string): string {
  return readFileSync(join(root, relPath), 'utf-8')
}

// ---------------------------------------------------------------------------
// Matrix coverage net: generated-matrix/ must have ZERO unknown occurrences
// ---------------------------------------------------------------------------

describe('matrix-no-unknown: source scan', () => {
  it('generated-matrix/models.ts contains no " unknown" token', () => {
    const src = read('generated-matrix/models.ts')
    // Filter out comment lines to avoid matching JSDOC comments like `/* int64, precision ... */`
    const nonCommentLines = src
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n')
    const hits = nonCommentLines.match(/ unknown\b/g)
    expect(hits, `models.ts has unexpected " unknown" tokens: ${JSON.stringify(hits)}`).toBeNull()
  })

  it('generated-matrix/service.ts contains no " unknown" token', () => {
    const src = read('generated-matrix/service.ts')
    const nonCommentLines = src
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n')
    const hits = nonCommentLines.match(/ unknown\b/g)
    expect(hits, `service.ts has unexpected " unknown" tokens: ${JSON.stringify(hits)}`).toBeNull()
  })

  it('generated-matrix/schemas.ts contains no "z.unknown()"', () => {
    const src = read('generated-matrix/schemas.ts')
    const hits = src.match(/z\.unknown\(\)/g)
    expect(hits, `schemas.ts has unexpected z.unknown() calls: ${JSON.stringify(hits)}`).toBeNull()
  })

  it('generated-matrix/router.ts contains no "z.unknown()"', () => {
    const src = read('generated-matrix/router.ts')
    const hits = src.match(/z\.unknown\(\)/g)
    expect(hits, `router.ts has unexpected z.unknown() calls: ${JSON.stringify(hits)}`).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Teeth proof: legit-unknown output MUST contain unknown
// This confirms the scan detector is not vacuous and correctly flags real unknowns.
// The legit-unknown spec uses intentionally-unknown constructs:
//   - additionalProperties:true  -> Record<string, unknown>
//   - empty {}                   -> Record<string, unknown>
// ---------------------------------------------------------------------------

describe('legit-unknown: scan detector has teeth', () => {
  it('generated-matrix-legit/models.ts DOES contain " unknown" (intentional)', () => {
    const src = read('generated-matrix-legit/models.ts')
    const nonCommentLines = src
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n')
    const hits = nonCommentLines.match(/ unknown\b/g)
    expect(
      hits,
      'legit-unknown models.ts should have " unknown" tokens (additionalProperties:true and empty {} produce unknown)'
    ).not.toBeNull()
  })
})
