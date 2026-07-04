/**
 * TypeScript-compiler-API helper for tests that need to verify generated output actually
 * TYPECHECKS, not just that it contains the right substrings. Complements the in-memory
 * compileFiles helper in packages/openapi-zod-ts/src/__tests__/helpers.ts (not imported
 * directly: it lives in a sibling package's test-only sources, outside its public API, and
 * that helper never needed real node_modules resolution since openapi-zod-ts client output
 * has zero runtime deps).
 *
 * Unlike an in-memory virtual filesystem, this writes files to a REAL temp directory nested
 * inside this package (not os.tmpdir()) so that Node's module resolution, walking up from
 * the temp directory, finds this package's real node_modules (zod, hono, express, fastify,
 * fastify-type-provider-zod) and resolves their real .d.ts files.
 *
 * Import with the .js extension as required by NodeNext module resolution:
 *   import { compileGeneratedFiles } from './ts-compile-helpers.js'
 */
import ts from 'typescript'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Directory that holds per-test scratch dirs; sibling of node_modules so resolution walks up into it. */
const scratchRoot = join(import.meta.dirname, '../../.typecheck-scratch')

/**
 * Write `files` (keyed by relative path, e.g. 'router.ts', '_shared/errors.ts') into a fresh
 * temp directory under this package, compile them with the real TypeScript compiler, and
 * return only the diagnostics that belong to those files (node_modules/lib.d.ts excluded).
 * Always cleans up the temp directory before returning, even on failure.
 */
export function compileGeneratedFiles(files: Record<string, string>): readonly ts.Diagnostic[] {
  mkdirSync(scratchRoot, { recursive: true })
  const dir = mkdtempSync(join(scratchRoot, 'run-'))
  try {
    const fileNames: string[] = []
    for (const [name, content] of Object.entries(files)) {
      const filePath = join(dir, name)
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, content, 'utf-8')
      fileNames.push(filePath)
    }

    const { options } = ts.convertCompilerOptionsFromJson(
      {
        strict: true,
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        noEmit: true,
        skipLibCheck: true,
        lib: ['ES2022', 'DOM'],
      },
      dir
    )

    const program = ts.createProgram(fileNames, options)
    return ts
      .getPreEmitDiagnostics(program)
      .filter((d) => d.file !== undefined && fileNames.includes(d.file.fileName))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Assert that a TypeScript compilation produced no diagnostics. Throws a descriptive
 * error listing all messages when diagnostics are present.
 *
 * @param diagnostics - result from compileGeneratedFiles
 * @param context - short label for the error message, e.g. "hono router + service (#377)"
 */
export function assertNoTsDiagnostics(
  diagnostics: readonly ts.Diagnostic[],
  context: string
): void {
  if (diagnostics.length > 0) {
    const messages = diagnostics
      .map((d) => {
        const loc =
          d.file !== undefined ? d.file.getLineAndCharacterOfPosition(d.start!) : undefined
        const at =
          loc !== undefined ? `${d.file!.fileName}:${loc.line + 1}:${loc.character + 1}` : ''
        return `${at} ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`
      })
      .join('\n')
    throw new Error(`TypeScript errors in ${context}:\n${messages}`)
  }
}
