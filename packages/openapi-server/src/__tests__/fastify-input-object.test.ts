/**
 * Regression tests for #350: the Fastify service interface must use a single
 * required `input` object (not positional optional args) so that the trusted
 * `ctx` arg can always follow it without triggering TS1016 (required parameter
 * cannot follow an optional parameter).
 *
 * Scenarios locked here:
 *   A. All-optional query params + context_type -> signature is `(input: { query: {...} }, ctx: Ctx)`,
 *      NOT `(params?: {...}, ctx: Ctx)`. The latter would be a TS1016.
 *   B. Zero-facet operation + context_type -> signature is just `(ctx: Ctx)`. No input param.
 *   C. Body-only operation (no query/params/headers/cookies) -> signature is `(input: { body: T })`.
 *   D. Mixed: path + body + query + context_type -> single input object with all three facets, then ctx.
 *   E. Router call site matches: query-only op calls service with `{ query: req.query }`.
 *   F. Router call site for zero-facet + context_type: `service.method(ctx)`.
 *
 * If the positional-arg shape ever returns, these tests will fail loudly.
 */

// fallow-ignore-file code-duplication
// Fixtures are intentionally per-test for locality and readability.
import { describe, expect, it } from 'vitest'
import type { OpenAPIV3_1 } from 'openapi-types'
import { generateFastifyTypedService } from '../plugins/fastify-service.js'
import { generateFastifyRouter } from '../plugins/router.js'

function makeSpec(paths: OpenAPIV3_1.PathsObject): OpenAPIV3_1.Document {
  return { openapi: '3.1.0', info: { title: 'Issue 350 Test', version: '1.0.0' }, paths }
}

const baseOpts = { schemaNames: new Set<string>(), schemaImportPath: '../schemas.js' }
const ctxOpts = { ...baseOpts, contextType: 'RequestContext' }

// ── A. All-optional query params + context_type (#350 root cause) ──────────────

describe('#350 regression: all-optional query params + context_type', () => {
  const spec = makeSpec({
    '/items': {
      get: {
        operationId: 'listItems',
        parameters: [
          { name: 'q', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer' } },
        ],
        responses: { '204': { description: 'No content' } },
      },
    },
  })

  it('emitted signature uses a single required input object, not positional optional args', () => {
    const { content } = generateFastifyTypedService(spec, ctxOpts)
    // Must use the input-object shape (TS1016-safe).
    expect(content).toContain('input: {')
    expect(content).toContain('query: {')
    expect(content).toContain('}, ctx: Ctx)')
  })

  it('query fields inside input carry their optionality (not the outer key)', () => {
    const { content } = generateFastifyTypedService(spec, ctxOpts)
    // q and limit are optional inside the query facet.
    expect(content).toContain('q?: string')
    expect(content).toContain('limit?: number')
  })

  it('there are NO positional optional args (no "param?:" at the top level)', () => {
    const { content } = generateFastifyTypedService(spec, ctxOpts)
    // Old shape had `params?: { q?: string; limit?: number }` or `query?: { ... }` as a positional arg.
    // That trailing "?" on the outer facet key is TS1016 when ctx follows.
    expect(content).not.toContain('query?:')
    expect(content).not.toContain('params?:')
  })

  it('router call site bundles query as a facet: service.listItems({ query: req.query }, ctx)', () => {
    const { content } = generateFastifyRouter(spec, { contextType: 'RequestContext' })
    expect(content).toContain('service.listItems({ query: req.query }, ctx)')
  })
})

// ── B. Zero-facet operation + context_type ─────────────────────────────────────

describe('#350: zero-facet op + context_type emits (ctx) with no input param', () => {
  const spec = makeSpec({
    '/health': {
      get: {
        operationId: 'getHealth',
        responses: { '204': { description: 'No content' } },
      },
    },
  })

  it('service signature is (ctx: Ctx) with no input param', () => {
    const { content } = generateFastifyTypedService(spec, ctxOpts)
    expect(content).toContain('getHealth(ctx: Ctx)')
    expect(content).not.toContain('input:')
  })

  it('router call site is service.getHealth(ctx)', () => {
    const { content } = generateFastifyRouter(spec, { contextType: 'RequestContext' })
    expect(content).toContain('service.getHealth(ctx)')
  })
})

// ── C. Body-only operation (no context_type) ───────────────────────────────────

describe('#350: body-only op emits input: { body: T }', () => {
  const spec = makeSpec({
    '/pets': {
      post: {
        operationId: 'createPet',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreatePetRequest' },
            },
          },
        },
        responses: { '201': { description: 'Created' } },
      },
    },
  })

  it('service signature has input: { body: CreatePetRequest } and no extra positional args', () => {
    const { content } = generateFastifyTypedService(spec, {
      schemaNames: new Set<string>(['CreatePetRequestSchema']),
      schemaImportPath: '../schemas.js',
    })
    expect(content).toContain('input: { body: CreatePetRequest }')
    // No positional ctx or query.
    expect(content).not.toContain('ctx: Ctx')
    expect(content).not.toContain('query?:')
  })
})

// ── D. Path + body + query + context_type: all facets in one input object ──────

describe('#350: mixed path + body + query + context_type', () => {
  const spec = makeSpec({
    '/pets/{id}': {
      patch: {
        operationId: 'updatePet',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'page', in: 'query', required: false, schema: { type: 'integer' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdatePetRequest' },
            },
          },
        },
        responses: { '200': { description: 'ok' } },
      },
    },
  })

  it('service signature has the EXACT combined shape: input: { params, body, query }, ctx', () => {
    const { content } = generateFastifyTypedService(spec, ctxOpts)
    // Exact combined assertion: all three facets in order inside one required input object,
    // ctx as a separate trailing arg. Any wrong structure (positional args, missing facets,
    // extra optional markers on the outer keys) will break this assertion.
    expect(content).toContain(
      'updatePet(input: { params: { id: string }; body: unknown; query: { page?: number } }, ctx: Ctx): Promise<void>'
    )
  })

  it('there are no top-level optional positional args', () => {
    const { content } = generateFastifyTypedService(spec, ctxOpts)
    // Optional query fields sit inside the input object; they must not leak to top-level.
    expect(content).not.toContain('query?:')
    expect(content).not.toContain('params?:')
  })

  it('router call site passes all facets as one exact object literal then ctx', () => {
    const { content } = generateFastifyRouter(spec, { contextType: 'RequestContext' })
    // Exact combined assertion: all three facets in the service call, ctx follows.
    expect(content).toContain(
      'service.updatePet({ params: req.params, body: req.body as UpdatePetRequest, query: req.query }, ctx)'
    )
  })
})

// ── E. Hyphenated path param: raw key in params facet (blocking bug fix) ────────

describe('hyphenated path param: params facet key matches req.params key', () => {
  // When a path param contains a hyphen (e.g. {job-id}), the Zod params schema and
  // req.params both use the raw key "job-id". The service params facet MUST use the
  // same raw key so that input.params["job-id"] works at runtime.
  // Using sanitizeOperationId("job-id") -> "jobId" was a blocking bug: input.params.jobId
  // would be undefined because req.params["job-id"] is the actual property.
  const spec = makeSpec({
    '/jobs/{job-id}': {
      get: {
        operationId: 'getJob',
        parameters: [{ name: 'job-id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'ok' } },
      },
    },
  })

  it('emits params: { "job-id": string } (raw quoted key, not camelCase jobId)', () => {
    const { content } = generateFastifyTypedService(spec, ctxOpts)
    // Raw quoted key must be present.
    expect(content).toContain('params: { "job-id": string }')
    // camelCase key (what sanitizeOperationId would produce) must NOT appear.
    expect(content).not.toContain('jobId')
  })

  it('router call site still passes params: req.params (no field destructuring)', () => {
    const { content } = generateFastifyRouter(spec, { contextType: 'RequestContext' })
    // Router passes the whole narrowed req.params object; key agreement is at runtime.
    expect(content).toContain('params: req.params')
  })

  it('identifier-safe path param (e.g. {id}) keeps plain key without quotes', () => {
    const plainSpec = makeSpec({
      '/pets/{id}': {
        get: {
          operationId: 'getPet',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const { content } = generateFastifyTypedService(plainSpec, ctxOpts)
    expect(content).toContain('params: { id: string }')
    // No unnecessary quotes on a plain identifier key.
    expect(content).not.toContain('"id"')
  })
})
