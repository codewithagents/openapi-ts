/**
 * Regression tests for issue #349: the @fastify/multipart and @fastify/formbody
 * parser-registration block must be emitted whenever the spec declares multipart/form-data
 * or application/x-www-form-urlencoded bodies, including when the requestBody is a $ref.
 *
 * Before the fix, requestBody: { $ref: '#/components/requestBodies/...' } was invisible to
 * the multipart detector (getBodyInfo returned { contentType: 'application/json' } for refs),
 * so the registration block was completely absent even for specs with 55+ multipart operations.
 */
import { describe, expect, it } from 'vitest'
import type { OpenAPIV3_1 } from 'openapi-types'
import { generateFastifyRouter } from '../plugins/router.js'

function makeSpec(
  paths: OpenAPIV3_1.PathsObject,
  components?: OpenAPIV3_1.ComponentsObject
): OpenAPIV3_1.Document {
  return {
    openapi: '3.1.0',
    info: { title: 'Upload API', version: '1.0.0' },
    paths,
    components,
  }
}

describe('generateFastifyRouter: multipart parser registration (#349)', () => {
  // ── Inline multipart (already worked before fix; must keep working) ──────────

  it('inline multipart/form-data body: emits registerParsers guard', () => {
    const spec = makeSpec({
      '/upload': {
        post: {
          operationId: 'uploadFile',
          requestBody: {
            required: true,
            content: { 'multipart/form-data': { schema: { type: 'object' } } },
          },
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const { content } = generateFastifyRouter(spec)
    expect(content).toContain('options?.registerParsers !== false')
    expect(content).toContain("import('@fastify/multipart')")
    expect(content).toContain(
      "app.register(_multipart.default ?? _multipart, { attachFieldsToBody: 'keyValues', ...options?.multipart })"
    )
  })

  // ── Regression (#384): use 'keyValues', not `true` (which wraps fields in busboy objects) ──
  it("registers multipart with attachFieldsToBody: 'keyValues', never bare true (#384)", () => {
    const spec = makeSpec({
      '/avatars': {
        post: {
          operationId: 'uploadAvatar',
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    caption: { type: 'string' },
                    file: { type: 'string', format: 'binary' },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'created' } },
        },
      },
    })
    const { content } = generateFastifyRouter(spec)
    expect(content).toContain("{ attachFieldsToBody: 'keyValues' }")
    // The old default wrapped every field in a busboy object; it must not be emitted.
    expect(content).not.toContain('attachFieldsToBody: true')
  })

  it('inline multipart/form-data route: emits multipart marker comment', () => {
    const spec = makeSpec({
      '/upload': {
        post: {
          operationId: 'uploadFile',
          requestBody: {
            required: true,
            content: { 'multipart/form-data': { schema: { type: 'object' } } },
          },
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const { content } = generateFastifyRouter(spec)
    expect(content).toContain("{ attachFieldsToBody: 'keyValues' }")
    expect(content).toContain('// multipart/form-data: req.body has field values directly')
  })

  it('inline multipart/form-data route: emits req.body as unknown cast', () => {
    const spec = makeSpec({
      '/upload': {
        post: {
          operationId: 'uploadFile',
          requestBody: {
            required: true,
            content: { 'multipart/form-data': { schema: { type: 'object' } } },
          },
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const { content } = generateFastifyRouter(spec)
    expect(content).toContain('req.body as unknown')
  })

  // ── $ref'd requestBody pointing at multipart component (THE BUG) ─────────────

  it('$ref multipart requestBody: emits registerParsers guard', () => {
    const spec = makeSpec(
      {
        '/upload': {
          post: {
            operationId: 'uploadFile',
            requestBody: { $ref: '#/components/requestBodies/MultipartUpload' },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
      {
        requestBodies: {
          MultipartUpload: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: { file: { type: 'string', format: 'binary' } },
                },
              },
            },
          },
        },
      }
    )
    const { content } = generateFastifyRouter(spec)
    // Before fix this was false (block absent entirely)
    expect(content).toContain('options?.registerParsers !== false')
    expect(content).toContain("import('@fastify/multipart')")
    expect(content).toContain(
      "app.register(_multipart.default ?? _multipart, { attachFieldsToBody: 'keyValues', ...options?.multipart })"
    )
  })

  it('$ref multipart requestBody: route emits multipart marker comment', () => {
    const spec = makeSpec(
      {
        '/upload': {
          post: {
            operationId: 'uploadFile',
            requestBody: { $ref: '#/components/requestBodies/MultipartUpload' },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
      {
        requestBodies: {
          MultipartUpload: {
            required: true,
            content: { 'multipart/form-data': { schema: { type: 'object' } } },
          },
        },
      }
    )
    const { content } = generateFastifyRouter(spec)
    expect(content).toContain("{ attachFieldsToBody: 'keyValues' }")
    expect(content).toContain('// multipart/form-data: req.body has field values directly')
  })

  it('$ref multipart requestBody: route emits req.body as unknown cast', () => {
    const spec = makeSpec(
      {
        '/upload': {
          post: {
            operationId: 'uploadFile',
            requestBody: { $ref: '#/components/requestBodies/MultipartUpload' },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
      {
        requestBodies: {
          MultipartUpload: {
            required: true,
            content: { 'multipart/form-data': { schema: { type: 'object' } } },
          },
        },
      }
    )
    const { content } = generateFastifyRouter(spec)
    expect(content).toContain('req.body as unknown')
  })

  it('multiple routes: some $ref multipart, some inline JSON: block present, non-multipart routes unaffected', () => {
    const spec = makeSpec(
      {
        '/items': {
          get: {
            operationId: 'getItems',
            responses: { '200': { description: 'ok' } },
          },
        },
        '/upload': {
          post: {
            operationId: 'uploadFile',
            requestBody: { $ref: '#/components/requestBodies/MultipartUpload' },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
      {
        requestBodies: {
          MultipartUpload: {
            required: true,
            content: { 'multipart/form-data': { schema: { type: 'object' } } },
          },
        },
      }
    )
    const { content } = generateFastifyRouter(spec)
    expect(content).toContain('options?.registerParsers !== false')
    expect(content).toContain("import('@fastify/multipart')")
    // The GET route has no body and should not include the multipart marker
    const marker = 'multipart/form-data: req.body has field values directly'
    const getRouteIdx = content.indexOf('app.get("/items"')
    const postRouteIdx = content.indexOf('app.post("/upload"')
    const markerIdx = content.indexOf(marker)
    // Marker must be in the POST route block (after the POST route declaration)
    expect(markerIdx).toBeGreaterThan(postRouteIdx)
    // Marker must not appear in the GET route block
    const getBlockEnd = postRouteIdx
    expect(content.slice(getRouteIdx, getBlockEnd)).not.toContain(marker)
  })

  // ── $ref'd formbody requestBody ───────────────────────────────────────────────

  it('$ref urlencoded requestBody: emits @fastify/formbody registration', () => {
    const spec = makeSpec(
      {
        '/submit': {
          post: {
            operationId: 'submitForm',
            requestBody: { $ref: '#/components/requestBodies/FormSubmit' },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
      {
        requestBodies: {
          FormSubmit: {
            required: true,
            content: {
              'application/x-www-form-urlencoded': { schema: { type: 'object' } },
            },
          },
        },
      }
    )
    const { content } = generateFastifyRouter(spec)
    expect(content).toContain('options?.registerParsers !== false')
    expect(content).toContain("import('@fastify/formbody')")
    expect(content).toContain('app.register(_formbody.default ?? _formbody)')
  })

  // ── JSON-only spec must NOT emit parser block ─────────────────────────────────

  it('JSON-only spec: no parser registration block emitted', () => {
    const spec = makeSpec({
      '/items': {
        post: {
          operationId: 'createItem',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: { '201': { description: 'created' } },
        },
      },
    })
    const { content } = generateFastifyRouter(spec)
    expect(content).not.toContain("import('@fastify/multipart')")
    expect(content).not.toContain("import('@fastify/formbody')")
    expect(content).not.toContain('_multipart')
    expect(content).not.toContain('_formbody')
  })

  // ── #384 secondary: multipart.limits option in CreateRouterOptions ─────────────

  it('spec with multipart body: emits multipart? option block in CreateRouterOptions', () => {
    const spec = makeSpec({
      '/upload': {
        post: {
          operationId: 'uploadFile',
          requestBody: {
            required: true,
            content: { 'multipart/form-data': { schema: { type: 'object' } } },
          },
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const { content } = generateFastifyRouter(spec)
    expect(content).toContain('multipart?: {')
    expect(content).toContain('limits?: {')
    expect(content).toContain('fileSize?: number')
    expect(content).toContain(
      "app.register(_multipart.default ?? _multipart, { attachFieldsToBody: 'keyValues', ...options?.multipart })"
    )
  })

  it('JSON-only spec: multipart? option block is NOT emitted in CreateRouterOptions', () => {
    const spec = makeSpec({
      '/items': {
        post: {
          operationId: 'createItem',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: { '201': { description: 'created' } },
        },
      },
    })
    const { content } = generateFastifyRouter(spec)
    expect(content).not.toContain('multipart?: {')
  })
})
