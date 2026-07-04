/**
 * Regression tests for issue #377: explode:true array query params must emit
 * z.array(<itemExpr>) plus repeated-key extraction in the Hono and Express routers,
 * not the scalar z.string() fallback that #375/#348 already fixed for Fastify.
 *
 * Before the fix, a query param with type:array (default explode:true) fell through to
 * z.string() in the emitted Zod schema, and extraction read a single scalar value
 * (c.req.query / req.query['name']), while the generated service method expects an
 * array type (number[] / boolean[] / string[]). Result: a TS2322 type mismatch in the
 * generated output. After the fix, extraction collects every repeated key and coerces
 * items to match z.array(<itemExpr>).
 */
import { describe, expect, it } from 'vitest'
import type { OpenAPIV3_1 } from 'openapi-types'
import { generateRouter, generateExpressRouter } from '../plugins/router.js'

function makeSpec(paths: OpenAPIV3_1.PathsObject): OpenAPIV3_1.Document {
  return { openapi: '3.1.0', info: { title: 'Test API', version: '1.0.0' }, paths }
}

function arrayQuerySpec(
  itemType: 'integer' | 'number' | 'boolean' | 'string'
): OpenAPIV3_1.Document {
  return makeSpec({
    '/items': {
      get: {
        operationId: 'getItems',
        parameters: [
          {
            name: 'ids',
            in: 'query',
            required: false,
            schema: { type: 'array', items: { type: itemType } },
          },
        ],
        responses: { '200': { description: 'ok' } },
      },
    },
  })
}

const requiredArraySpec = makeSpec({
  '/items': {
    get: {
      operationId: 'getItems',
      parameters: [
        {
          name: 'ids',
          in: 'query',
          required: true,
          schema: { type: 'array', items: { type: 'integer' } },
        },
      ],
      responses: { '200': { description: 'ok' } },
    },
  },
})

describe('generateRouter (Hono): explode:true array query params (#377)', () => {
  it('integer array emits z.array(z.coerce.number()) and c.req.queries().map(Number)', () => {
    const { content } = generateRouter(arrayQuerySpec('integer'))
    expect(content).toContain('z.array(z.coerce.number())')
    expect(content).toContain("c.req.queries('ids')?.map(Number)")
    // Must NOT fall through to a bare scalar read/schema.
    expect(content).not.toMatch(/ids:\s*z\.string\(\)/)
    expect(content).not.toContain("c.req.query('ids')")
  })

  it('boolean array emits z.array(z.boolean()) and coerces items via === "true"', () => {
    const { content } = generateRouter(arrayQuerySpec('boolean'))
    expect(content).toContain('z.array(z.boolean())')
    expect(content).toContain("c.req.queries('ids')?.map((v) => v === 'true')")
  })

  it('string array emits z.array(z.string()) and collects repeated keys with no item coercion', () => {
    const { content } = generateRouter(arrayQuerySpec('string'))
    expect(content).toContain('z.array(z.string())')
    expect(content).toContain("ids: c.req.queries('ids')")
    expect(content).not.toContain("c.req.queries('ids')?.map(")
  })
})

describe('generateExpressRouter: explode:true array query params (#377)', () => {
  it('integer array emits z.array(z.coerce.number()) and a normalized, mapped extraction', () => {
    const { content } = generateExpressRouter(arrayQuerySpec('integer'))
    expect(content).toContain('z.array(z.coerce.number())')
    expect(content).toContain(
      "_toQueryArray(req.query['ids'] as string | string[] | undefined)?.map(Number)"
    )
    expect(content).not.toMatch(/ids:\s*z\.string\(\)/)
    expect(content).not.toContain("Number(req.query['ids'] as string)")
  })

  it('boolean array emits z.array(z.boolean()) and coerces items via === "true"', () => {
    const { content } = generateExpressRouter(arrayQuerySpec('boolean'))
    expect(content).toContain('z.array(z.boolean())')
    expect(content).toContain(
      "_toQueryArray(req.query['ids'] as string | string[] | undefined)?.map((v) => v === 'true')"
    )
  })

  it('string array emits z.array(z.string()) and the normalized array with no item coercion', () => {
    const { content } = generateExpressRouter(arrayQuerySpec('string'))
    expect(content).toContain('z.array(z.string())')
    expect(content).toContain(
      "ids: _toQueryArray(req.query['ids'] as string | string[] | undefined)"
    )
    expect(content).not.toContain('?.map(')
  })

  it('emits the shared _toQueryArray normalizer once, only when an array param exists', () => {
    const { content } = generateExpressRouter(arrayQuerySpec('integer'))
    const matches = content.match(/function _toQueryArray/g) ?? []
    expect(matches).toHaveLength(1)
  })

  it('does NOT emit _toQueryArray when no array query param exists', () => {
    const spec = makeSpec({
      '/items': {
        get: {
          operationId: 'getItems',
          parameters: [{ name: 'q', in: 'query', required: false, schema: { type: 'string' } }],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const { content } = generateExpressRouter(spec)
    expect(content).not.toContain('_toQueryArray')
  })
})

describe('required array param omits .optional() on the z.array(...) expression', () => {
  it.each([
    ['Hono', generateRouter],
    ['Express', generateExpressRouter],
  ] as const)('%s', (_, gen) => {
    const { content } = gen(requiredArraySpec)
    expect(content).toContain('z.array(z.coerce.number())')
    expect(content).not.toMatch(/ids:\s*z\.array\(z\.coerce\.number\(\)\)\.optional\(\)/)
  })
})

describe('Hono and Express agree with the existing Fastify fix (#375/#348) on service query type', () => {
  it.each([
    ['Hono', generateRouter],
    ['Express', generateExpressRouter],
  ] as const)('%s: does not disturb the delimited (explode:false) array path', (_, gen) => {
    const spec = makeSpec({
      '/items': {
        get: {
          operationId: 'getItems',
          parameters: [
            {
              name: 'csv',
              in: 'query',
              required: true,
              style: 'form',
              explode: false,
              schema: { type: 'array', items: { type: 'integer' } },
            } as OpenAPIV3_1.ParameterObject,
          ],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const { content } = gen(spec)
    // Delimited arrays are untouched by the isArray branch: still split + z.array(z.string()).
    expect(content).toContain('.split(",")')
    expect(content).toContain('z.array(z.string())')
  })
})
