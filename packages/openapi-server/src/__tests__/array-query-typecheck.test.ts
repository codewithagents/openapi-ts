/**
 * Typechecked guard for issue #377.
 *
 * compat-matrix.test.ts only asserts that generation "does not throw" — it never actually
 * compiles the output, which is exactly why the hono/express explode:true array query
 * param bug (a TS2322 mismatch between the emitted Zod/extraction type and the service's
 * T[] signature) slipped through undetected. This file closes that gap: it feeds the real
 * generated service.ts + router.ts (+ _shared/errors.ts) for a single explode:true integer
 * array query param through the actual TypeScript compiler, for all three frameworks, so a
 * regression here fails loudly with a real tsc diagnostic instead of a passing string match.
 *
 * Requires real `zod`, `hono`, `express`, and `fastify`/`fastify-type-provider-zod` type
 * declarations to resolve on disk (devDependencies of this package) — compileGeneratedFiles falls
 * back to real node_modules resolution for bare specifiers.
 */
import { describe, it } from 'vitest'
import type { OpenAPIV3_1 } from 'openapi-types'
import { generateService } from '../plugins/service.js'
import { generateRouter, generateExpressRouter, generateFastifyRouter } from '../plugins/router.js'
import { generateFastifyTypedService } from '../plugins/fastify-service.js'
import { emitSharedErrorsFile } from '../plugins/errors-emitter.js'
import { compileGeneratedFiles, assertNoTsDiagnostics } from './ts-compile-helpers.js'

const arrayQuerySpec: OpenAPIV3_1.Document = {
  openapi: '3.1.0',
  info: { title: 'Array Query Typecheck', version: '1.0.0' },
  paths: {
    '/items': {
      get: {
        operationId: 'listItems',
        parameters: [
          {
            name: 'ids',
            in: 'query',
            required: false,
            schema: { type: 'array', items: { type: 'integer' } },
          },
        ],
        responses: { '204': { description: 'No content' } },
      },
    },
  },
}

const sharedErrors = emitSharedErrorsFile()

describe('explode:true numeric array query param round-trip typechecks (#377)', () => {
  it('Hono: service.ts + router.ts compile with no TS errors', () => {
    const service = generateService(arrayQuerySpec)
    const router = generateRouter(arrayQuerySpec)
    const diagnostics = compileGeneratedFiles({
      'service.ts': service.content,
      'router.ts': router.content,
      '_shared/errors.ts': sharedErrors.content,
    })
    assertNoTsDiagnostics(diagnostics, 'Hono router.ts + service.ts (#377)')
  })

  it('Express: service.ts + router.ts compile with no TS errors', () => {
    const service = generateService(arrayQuerySpec)
    const router = generateExpressRouter(arrayQuerySpec)
    const diagnostics = compileGeneratedFiles({
      'service.ts': service.content,
      'router.ts': router.content,
      '_shared/errors.ts': sharedErrors.content,
    })
    assertNoTsDiagnostics(diagnostics, 'Express router.ts + service.ts (#377)')
  })

  it('Fastify: service.ts + router.ts compile with no TS errors (control: already correct pre-#377)', () => {
    const fastifyOpts = { schemaNames: new Set<string>(), schemaImportPath: './schemas.js' }
    const service = generateFastifyTypedService(arrayQuerySpec, fastifyOpts)
    const router = generateFastifyRouter(arrayQuerySpec, fastifyOpts)
    const diagnostics = compileGeneratedFiles({
      'service.ts': service.content,
      'router.ts': router.content,
      '_shared/errors.ts': sharedErrors.content,
    })
    assertNoTsDiagnostics(diagnostics, 'Fastify router.ts + service.ts (#377 control)')
  })

  it('sanity check: compileGeneratedFiles actually surfaces a diagnostic for a genuine type mismatch', () => {
    // Proves the guard above is not vacuously green: a hand-rolled service/router pair with
    // the SAME shape of bug this issue fixes (scalar passed where T[] is expected) must fail.
    const service = 'export interface X { m(params?: { ids?: number[] }): Promise<void> }\n'
    const router =
      "import type { X } from './service.js'\n" +
      'declare const service: X\n' +
      "const params: { ids: string } = { ids: '1' }\n" +
      'service.m(params)\n'
    const diagnostics = compileGeneratedFiles({ 'service.ts': service, 'router.ts': router })
    if (diagnostics.length === 0) {
      throw new Error(
        'expected a TS diagnostic for the deliberate ids: string vs number[] mismatch'
      )
    }
  })
})
