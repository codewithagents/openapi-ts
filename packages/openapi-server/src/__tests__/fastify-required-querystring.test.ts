/**
 * Regression test for #344: required querystring params must NOT have .optional()
 * in the generated Fastify schema.querystring, and the handler must forward
 * req.query (the narrowed value) directly to the service call.
 *
 * The legacy mutating Fastify emitter is superseded in HEAD (router.ts delegates
 * to fastify-type-provider; nothing to patch there). The 2.x emitter already
 * narrows required params via withOptional, which appends .optional() ONLY when
 * required===false. This test locks that invariant so a future regression fails
 * loudly with a clear traceable failure.
 *
 * Empirical tsc proof is provided in-repo: packages/petstore-fastify/generated/router.ts
 * labQuery (GET /lab/query) emits required enum + coerced number + regex string params
 * with no .optional(), and the CI typecheck gate (tsconfig.typecheck.json) verifies
 * the generated router typechecks against the Fastify service interface.
 */

// fallow-ignore-file code-duplication
// Test specs and assertion patterns are intentionally per-test for locality and readability.
import { describe, expect, it } from 'vitest'
import type { OpenAPIV3_1 } from 'openapi-types'
import { generateFastifyRouter } from '../plugins/router.js'

// ── Fixture helpers ────────────────────────────────────────────────────────────

function makeSpec(paths: OpenAPIV3_1.PathsObject): OpenAPIV3_1.Document {
  return {
    openapi: '3.1.0',
    info: { title: 'Query Narrowing Test', version: '1.0.0' },
    paths,
  }
}

// ── #344: required querystring params must not leak .optional() ───────────────

describe('Fastify type-provider: required querystring params are narrowed (#344)', () => {
  const spec = makeSpec({
    '/search': {
      get: {
        operationId: 'searchItems',
        parameters: [
          // required string: must NOT have .optional()
          { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
          // required integer: must NOT have .optional() (exercises z.coerce.number())
          { name: 'limit', in: 'query', required: true, schema: { type: 'integer' } },
          // required enum: must NOT have .optional()
          {
            name: 'tier',
            in: 'query',
            required: true,
            schema: { type: 'string', enum: ['bronze', 'silver', 'gold'] },
          },
          // optional string: MUST have .optional()
          { name: 'cursor', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: { '204': { description: 'No content' } },
      },
    },
  })

  it('required string param appears in querystring schema WITHOUT .optional()', () => {
    const { content } = generateFastifyRouter(spec)
    // q is required: schema field must be exactly z.string(), not z.string().optional()
    expect(content).toContain('q: z.string()')
    expect(content).not.toContain('q: z.string().optional()')
  })

  it('required integer param uses z.coerce.number() WITHOUT .optional()', () => {
    const { content } = generateFastifyRouter(spec)
    // limit is required integer: schema field must be z.coerce.number(), no .optional()
    expect(content).toContain('limit: z.coerce.number()')
    expect(content).not.toContain('limit: z.coerce.number().optional()')
  })

  it('required enum param uses z.enum([...]) WITHOUT .optional()', () => {
    const { content } = generateFastifyRouter(spec)
    // tier is required enum: schema field must be z.enum([...]), no .optional()
    expect(content).toContain('tier: z.enum(["bronze", "silver", "gold"])')
    expect(content).not.toContain('tier: z.enum(["bronze", "silver", "gold"]).optional()')
  })

  it('optional string param appears in querystring schema WITH .optional()', () => {
    const { content } = generateFastifyRouter(spec)
    // cursor is optional: schema field must have .optional()
    expect(content).toContain('cursor: z.string().optional()')
  })

  it('handler forwards req.query (narrowed by ZodTypeProvider) to the service call', () => {
    const { content } = generateFastifyRouter(spec)
    // The handler wraps the narrowed req.query inside the single input object.
    // ZodTypeProvider infers the narrowed type from schema.querystring so required
    // fields are non-undefined in the service arg.
    expect(content).toContain('service.searchItems({ query: req.query })')
    // The old positional shape (passing req.query as a bare first arg) must not appear.
    expect(content).not.toContain('service.searchItems(req.query)')
  })

  it('querystring schema block wraps all query params in z.object({ ... })', () => {
    const { content } = generateFastifyRouter(spec)
    expect(content).toContain('querystring: z.object({')
  })
})

// ── Mixed required + optional: single operation with both ────────────────────

describe('Fastify: mixed required + optional query params in one operation', () => {
  const mixedSpec = makeSpec({
    '/items': {
      get: {
        operationId: 'listItems',
        parameters: [
          { name: 'page', in: 'query', required: true, schema: { type: 'integer' } },
          { name: 'size', in: 'query', required: true, schema: { type: 'integer' } },
          { name: 'filter', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'ok' } },
      },
    },
  })

  it('required integer params have no .optional()', () => {
    const { content } = generateFastifyRouter(mixedSpec)
    expect(content).toContain('page: z.coerce.number()')
    expect(content).toContain('size: z.coerce.number()')
    expect(content).not.toContain('page: z.coerce.number().optional()')
    expect(content).not.toContain('size: z.coerce.number().optional()')
  })

  it('optional string param has .optional()', () => {
    const { content } = generateFastifyRouter(mixedSpec)
    expect(content).toContain('filter: z.string().optional()')
  })

  it('handler forwards the narrowed req.query to the service', () => {
    const { content } = generateFastifyRouter(mixedSpec)
    expect(content).toContain('service.listItems({ query: req.query })')
  })
})
