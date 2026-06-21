/**
 * Regression tests for issue #348: array query params must emit z.array(...) in the
 * Fastify querystring schema, not a bare scalar Zod expression.
 *
 * Before the fix, a query param with type:array emitted z.string().optional() (wrong),
 * which disagreed with the service signature T[] causing TS2345. After the fix it emits
 * z.array(<itemExpr>).optional() (correct).
 */
import { describe, expect, it } from 'vitest'
import type { OpenAPIV3_1 } from 'openapi-types'
import { generateFastifyRouter } from '../plugins/router.js'

function makeSpec(paths: OpenAPIV3_1.PathsObject): OpenAPIV3_1.Document {
  return { openapi: '3.1.0', info: { title: 'Test API', version: '1.0.0' }, paths }
}

describe('generateFastifyRouter: array query params (#348)', () => {
  it('optional string array emits z.array(z.string()).optional() not z.string().optional()', () => {
    const spec = makeSpec({
      '/items': {
        get: {
          operationId: 'getItems',
          parameters: [
            {
              name: 'ids',
              in: 'query',
              required: false,
              schema: { type: 'array', items: { type: 'string' } },
            },
          ],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const { content } = generateFastifyRouter(spec)
    // Must use z.array, not a bare scalar
    expect(content).toContain('z.array(z.string()).optional()')
    // Must NOT emit a bare z.string().optional() for an array param
    expect(content).not.toMatch(/ids:\s*z\.string\(\)\.optional\(\)/)
  })

  it('required string array emits z.array(z.string()) without .optional()', () => {
    const spec = makeSpec({
      '/items': {
        get: {
          operationId: 'getItems',
          parameters: [
            {
              name: 'tags',
              in: 'query',
              required: true,
              schema: { type: 'array', items: { type: 'string' } },
            },
          ],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const { content } = generateFastifyRouter(spec)
    expect(content).toContain('z.array(z.string())')
    // Required array must not be wrapped in .optional()
    expect(content).not.toMatch(/tags:\s*z\.array\(z\.string\(\)\)\.optional\(\)/)
  })

  it('integer array emits z.array(z.coerce.number()) for item coercion', () => {
    const spec = makeSpec({
      '/items': {
        get: {
          operationId: 'getItems',
          parameters: [
            {
              name: 'counts',
              in: 'query',
              required: false,
              schema: { type: 'array', items: { type: 'integer' } },
            },
          ],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const { content } = generateFastifyRouter(spec)
    expect(content).toContain('z.array(z.coerce.number()).optional()')
  })

  it('number array emits z.array(z.coerce.number()) for item coercion', () => {
    const spec = makeSpec({
      '/items': {
        get: {
          operationId: 'getItems',
          parameters: [
            {
              name: 'prices',
              in: 'query',
              required: false,
              schema: { type: 'array', items: { type: 'number' } },
            },
          ],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const { content } = generateFastifyRouter(spec)
    expect(content).toContain('z.array(z.coerce.number()).optional()')
  })

  it('array query param is placed in querystring schema object', () => {
    const spec = makeSpec({
      '/items': {
        get: {
          operationId: 'getItems',
          parameters: [
            {
              name: 'ids',
              in: 'query',
              required: false,
              schema: { type: 'array', items: { type: 'string' } },
            },
          ],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const { content } = generateFastifyRouter(spec)
    // The field must be inside schema.querystring: { ids: z.array(...) }
    expect(content).toContain('querystring: z.object({')
    expect(content).toContain('ids: z.array(z.string()).optional()')
  })

  it('handler forwards req.query to the service call', () => {
    const spec = makeSpec({
      '/items': {
        get: {
          operationId: 'getItems',
          parameters: [
            {
              name: 'ids',
              in: 'query',
              required: false,
              schema: { type: 'array', items: { type: 'string' } },
            },
          ],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const { content } = generateFastifyRouter(spec)
    // The service call must receive req.query (not individual extracted fields)
    expect(content).toContain('service.getItems(req.query)')
  })

  it('array param does not produce a preValidation hook (no reshaping needed)', () => {
    const spec = makeSpec({
      '/items': {
        get: {
          operationId: 'getItems',
          parameters: [
            {
              name: 'ids',
              in: 'query',
              required: false,
              schema: { type: 'array', items: { type: 'string' } },
            },
          ],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const { content } = generateFastifyRouter(spec)
    // Plain array (explode:true) does not need preValidation reshaping
    expect(content).not.toContain('preValidation')
  })

  it('existing delimited-array (explode:false) still emits z.array(z.string()) with preValidation', () => {
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
              schema: { type: 'array', items: { type: 'string' } },
            },
          ],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const { content } = generateFastifyRouter(spec)
    expect(content).toContain('z.array(z.string())')
    expect(content).toContain('preValidation')
  })

  it('mixed spec: array param and scalar param coexist in same querystring schema', () => {
    const spec = makeSpec({
      '/items': {
        get: {
          operationId: 'getItems',
          parameters: [
            {
              name: 'ids',
              in: 'query',
              required: false,
              schema: { type: 'array', items: { type: 'string' } },
            },
            {
              name: 'page',
              in: 'query',
              required: false,
              schema: { type: 'integer' },
            },
          ],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const { content } = generateFastifyRouter(spec)
    expect(content).toContain('ids: z.array(z.string()).optional()')
    expect(content).toContain('page: z.coerce.number().optional()')
  })
})
