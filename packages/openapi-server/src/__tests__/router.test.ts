import { describe, expect, it } from 'vitest'
import type { OpenAPIV3_1 } from 'openapi-types'
import { generateRouter, generateExpressRouter, generateFastifyRouter } from '../plugins/router.js'

// ── Fixture helpers ────────────────────────────────────────────────────────────

function makeSpec(paths: OpenAPIV3_1.PathsObject, title = 'Pet Store'): OpenAPIV3_1.Document {
  return {
    openapi: '3.1.0',
    info: { title, version: '1.0.0' },
    paths,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('generateRouter', () => {
  it('returns a GeneratedFile with filename router.ts', () => {
    const spec = makeSpec({})
    const result = generateRouter(spec)
    expect(result).toBeDefined()
    expect(result.filename).toBe('router.ts')
  })

  it('output starts with auto-generated header', () => {
    const spec = makeSpec({})
    const result = generateRouter(spec)
    expect(result.content).toMatch(/^\/\/ This file is auto-generated/)
  })

  it('imports Hono from hono', () => {
    const spec = makeSpec({})
    const result = generateRouter(spec)
    expect(result.content).toContain("import { Hono } from 'hono'")
  })

  it('imports service interface from service.js', () => {
    const spec = makeSpec({})
    const result = generateRouter(spec)
    expect(result.content).toContain("from './service.js'")
  })

  it('exports createRouter function', () => {
    const spec = makeSpec({})
    const result = generateRouter(spec)
    expect(result.content).toContain('export function createRouter(')
  })

  it('GET route uses app.get', () => {
    const spec = makeSpec({
      '/pets': {
        get: {
          operationId: 'listPets',
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const result = generateRouter(spec)
    expect(result.content).toContain('app.get("/pets"')
  })

  it('POST route uses app.post', () => {
    const spec = makeSpec({
      '/pets': {
        post: {
          operationId: 'createPet',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CreatePetRequest' } },
            },
          },
          responses: { '201': { description: 'created' } },
        },
      },
    })
    const result = generateRouter(spec)
    expect(result.content).toContain('app.post("/pets"')
  })

  it('DELETE route uses app.delete', () => {
    const spec = makeSpec({
      '/pets/{id}': {
        delete: {
          operationId: 'deletePet',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '204': { description: 'deleted' } },
        },
      },
    })
    const result = generateRouter(spec)
    expect(result.content).toContain('app.delete("/pets/:id"')
  })

  it('path param {id} becomes :id in Hono route', () => {
    const spec = makeSpec({
      '/pets/{id}': {
        get: {
          operationId: 'getPet',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const result = generateRouter(spec)
    expect(result.content).toContain('app.get("/pets/:id"')
  })

  it('path param extracted via c.req.param()', () => {
    const spec = makeSpec({
      '/pets/{id}': {
        get: {
          operationId: 'getPet',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const result = generateRouter(spec)
    expect(result.content).toContain('c.req.param("id")')
  })

  it('query params extracted via c.req.query()', () => {
    const spec = makeSpec({
      '/pets': {
        get: {
          operationId: 'listPets',
          parameters: [
            { name: 'species', in: 'query', required: false, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const result = generateRouter(spec)
    expect(result.content).toContain("c.req.query('species')")
  })

  it('numeric query param uses Number() coercion', () => {
    const spec = makeSpec({
      '/pets': {
        get: {
          operationId: 'listPets',
          parameters: [
            { name: 'limit', in: 'query', required: false, schema: { type: 'integer' } },
          ],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const result = generateRouter(spec)
    expect(result.content).toContain('Number(')
  })

  it('POST extracts JSON body via JSON.parse(c.req.text()) cast to typed type', () => {
    const spec = makeSpec({
      '/pets': {
        post: {
          operationId: 'createPet',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CreatePetRequest' } },
            },
          },
          responses: { '201': { description: 'created' } },
        },
      },
    })
    const result = generateRouter(spec)
    expect(result.content).toContain('JSON.parse(await c.req.text()) as CreatePetRequest')
  })

  it('imports body type from models.js when typed body used', () => {
    const spec = makeSpec({
      '/pets': {
        post: {
          operationId: 'createPet',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CreatePetRequest' } },
            },
          },
          responses: { '201': { description: 'created' } },
        },
      },
    })
    const result = generateRouter(spec)
    expect(result.content).toContain("import type { CreatePetRequest } from './models.js'")
  })

  it('no models import when no typed body', () => {
    const spec = makeSpec({
      '/pets': {
        get: {
          operationId: 'listPets',
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const result = generateRouter(spec)
    expect(result.content).not.toContain("from './models.js'")
  })

  it('POST with 201 response uses c.json(result, 201)', () => {
    const spec = makeSpec({
      '/pets': {
        post: {
          operationId: 'createPet',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: {
            '201': {
              description: 'created',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
            },
          },
        },
      },
    })
    const result = generateRouter(spec)
    expect(result.content).toContain('c.json(await service.createPet(')
    expect(result.content).toContain(', 201)')
  })

  it('DELETE with 204 returns new Response(null, { status: 204 })', () => {
    const spec = makeSpec({
      '/pets/{id}': {
        delete: {
          operationId: 'deletePet',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '204': { description: 'deleted' } },
        },
      },
    })
    const result = generateRouter(spec)
    expect(result.content).toContain('new Response(null, { status: 204 })')
  })

  it('POST with only 202 declared emits c.json(result, 202)', () => {
    // Bug #9: when the single declared 2xx is not 200/201/204, honor that code.
    const spec = makeSpec({
      '/jobs': {
        post: {
          operationId: 'enqueueJob',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: {
            '202': {
              description: 'accepted',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Job' } } },
            },
          },
        },
      },
    })
    const result = generateRouter(spec)
    expect(result.content).toContain('c.json(await service.enqueueJob(')
    expect(result.content).toContain(', 202)')
  })

  it('Bug #10 — GET with 200+202 declared emits envelope dispatch: c.json(_envelope.body, _envelope.status)', () => {
    // Bug #10: when multiple 2xx are declared, the service returns { status, body }
    // and the router forwards both to c.json so the handler can select the status at runtime.
    const spec = makeSpec({
      '/tasks/{id}': {
        get: {
          operationId: 'getTask',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'done',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Task' } } },
            },
            '202': {
              description: 'still running',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Task' } } },
            },
          },
        },
      },
    })
    const result = generateRouter(spec)
    expect(result.content).toContain('const _envelope = await service.getTask(')
    expect(result.content).toContain('c.json(_envelope.body, _envelope.status')
    // Must NOT use the old single-status path
    expect(result.content).not.toContain('c.json(await service.getTask(')
  })

  it('returns empty Hono app when no operations', () => {
    const spec = makeSpec({})
    const result = generateRouter(spec)
    expect(result.content).toContain('const app = new Hono()')
    expect(result.content).toContain('return app')
  })

  it('multiple path params passed in order to service', () => {
    const spec = makeSpec({
      '/owners/{ownerId}/pets/{petId}': {
        get: {
          operationId: 'getOwnerPet',
          parameters: [
            { name: 'ownerId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'petId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const result = generateRouter(spec)
    // Should pass both path params
    expect(result.content).toContain('c.req.param("ownerId")')
    expect(result.content).toContain('c.req.param("petId")')
  })

  it('query param name with [] suffix is normalized to a valid TypeScript identifier', () => {
    const spec = makeSpec({
      '/events': {
        get: {
          operationId: 'listEvents',
          parameters: [
            { name: 'project_ids[]', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'event_types[]', in: 'query', required: false, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const result = generateRouter(spec)
    // Normalized names must be used as TypeScript property names in the params object
    expect(result.content).toContain('projectIds')
    expect(result.content).toContain('eventTypes')
    // Raw names with [] must not appear in generated TypeScript
    expect(result.content).not.toContain('project_ids[]')
    expect(result.content).not.toContain('event_types[]')
  })

  it('path param with hyphens like {job-id}: c.req.param uses raw name from path', () => {
    const spec = makeSpec({
      '/jobs/{job-id}': {
        get: {
          operationId: 'getJob',
          parameters: [{ name: 'job-id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const result = generateRouter(spec)
    // c.req.param uses the raw OpenAPI path param name matching the Hono route :job-id
    expect(result.content).toContain('c.req.param("job-id")')
    // The generated code must call the service method
    expect(result.content).toContain('service.getJob(')
  })

  it('mixed path segment "{maxLat}.{format}" (no operationId) does not break method name derivation', () => {
    const spec = makeSpec({
      '/map/{versionNumber}/tile/{maxLon}/{maxLat}.{format}': {
        get: {
          // no operationId — forces deriveOperationName to handle the mixed segment
          parameters: [
            { name: 'versionNumber', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'maxLon', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'maxLat', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'format', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const result = generateRouter(spec)
    // The derived method name must be a valid identifier — no }.{ from mixed segment
    expect(result.content).not.toMatch(/service\.[a-zA-Z]*\}/)
    // A route handler must be generated
    expect(result.content).toContain('app.get(')
  })

  it('service interface reference uses title-derived name', () => {
    const spec = makeSpec({}, 'My API')
    const result = generateRouter(spec)
    expect(result.content).toContain('MyAPIService')
  })
})

// ── Schema validation tests ────────────────────────────────────────────────────

describe('generateRouter with schemaNames (Zod validation)', () => {
  const postSpec = makeSpec({
    '/pets': {
      post: {
        operationId: 'createPet',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreatePetRequest' } },
          },
        },
        responses: { '201': { description: 'created' } },
      },
    },
  })

  it('adds safeParse validation when schema is in schemaNames', () => {
    const result = generateRouter(postSpec, {
      schemaNames: new Set(['CreatePetRequestSchema']),
      schemaImportPath: './schemas.js',
    })
    expect(result.content).toContain('CreatePetRequestSchema.safeParse(body)')
    expect(result.content).toContain('parseResult.success')
    expect(result.content).toContain('422')
  })

  it('uses validatedBody in service call when schema is present', () => {
    const result = generateRouter(postSpec, {
      schemaNames: new Set(['CreatePetRequestSchema']),
      schemaImportPath: './schemas.js',
    })
    expect(result.content).toContain('validatedBody')
    expect(result.content).toContain('service.createPet(validatedBody')
  })

  it('imports z from zod and schema from schemaImportPath', () => {
    const result = generateRouter(postSpec, {
      schemaNames: new Set(['CreatePetRequestSchema']),
      schemaImportPath: './schemas.js',
    })
    expect(result.content).toContain("import { z } from 'zod'")
    expect(result.content).toContain("import { CreatePetRequestSchema } from './schemas.js'")
  })

  it('does not import schema when schemaNames does not match the body type', () => {
    const result = generateRouter(postSpec, {
      schemaNames: new Set(['SomeOtherSchema']),
      schemaImportPath: './schemas.js',
    })
    expect(result.content).not.toContain("import { z } from 'zod'")
    expect(result.content).not.toContain('safeParse')
  })

  it('does not add validation when options is undefined', () => {
    const result = generateRouter(postSpec)
    expect(result.content).not.toContain('safeParse')
    expect(result.content).not.toContain("import { z } from 'zod'")
    // uses body directly in service call
    expect(result.content).toContain('service.createPet(body')
  })

  it('does not add validation when schemaNames is empty set', () => {
    const result = generateRouter(postSpec, {
      schemaNames: new Set(),
      schemaImportPath: './schemas.js',
    })
    expect(result.content).not.toContain('safeParse')
    expect(result.content).toContain('service.createPet(body')
  })

  it('returns 422 with Zod issues on parse failure', () => {
    const result = generateRouter(postSpec, {
      schemaNames: new Set(['CreatePetRequestSchema']),
      schemaImportPath: './schemas.js',
    })
    expect(result.content).toContain(
      "{ error: 'Invalid request body', issues: parseResult.error.issues }"
    )
    expect(result.content).toContain('422')
  })

  it('only imports schemas actually used', () => {
    const specWithTwo = makeSpec({
      '/pets': {
        post: {
          operationId: 'createPet',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CreatePetRequest' } },
            },
          },
          responses: { '201': { description: 'created' } },
        },
      },
      '/owners': {
        post: {
          operationId: 'createOwner',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CreateOwnerRequest' } },
            },
          },
          responses: { '201': { description: 'created' } },
        },
      },
    })
    // Only CreatePetRequestSchema in schemaNames, not CreateOwnerRequestSchema
    const result = generateRouter(specWithTwo, {
      schemaNames: new Set(['CreatePetRequestSchema']),
      schemaImportPath: './schemas.js',
    })
    expect(result.content).toContain('CreatePetRequestSchema')
    expect(result.content).not.toContain('CreateOwnerRequestSchema')
  })
})

describe('coverage: requestBody as $ref — body type falls back to untyped', () => {
  it('requestBody $ref produces a route handler without a typed body extraction', () => {
    // Covers the `if (isRef(requestBody)) return { typeName: undefined }` branch
    const spec = makeSpec({
      '/items': {
        post: {
          operationId: 'createItem',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          requestBody: { $ref: '#/components/requestBodies/ItemBody' } as any,
          responses: { '201': { description: 'created' } },
        },
      },
    })
    const { content } = generateRouter(spec)
    // Route is still generated, body is just untyped
    expect(content).toContain('app.post("/items"')
    expect(content).toContain('service.createItem(')
  })
})

describe('coverage: 200 response as $ref — falls through to default status 200', () => {
  it('$ref 200 response is treated as a plain 200 with unknown return', () => {
    // Covers the `if (!isRef(resp))` false branch in getResponseStatus
    const spec = makeSpec({
      '/items/{id}': {
        get: {
          operationId: 'getItem',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          responses: { '200': { $ref: '#/components/responses/ItemResponse' } as any },
        },
      },
    })
    const { content } = generateRouter(spec)
    expect(content).toContain('app.get("/items/:id"')
    expect(content).toContain('service.getItem(')
  })
})

describe('coverage: requestBody with no content property — falls back to untyped body', () => {
  it('requestBody with content: undefined produces untyped body route handler', () => {
    // Covers the `if (content === undefined) return { typeName: undefined }` branch
    const spec = makeSpec({
      '/items': {
        post: {
          operationId: 'createItem',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          requestBody: { required: true } as any, // no content property
          responses: { '201': { description: 'created' } },
        },
      },
    })
    const { content } = generateRouter(spec)
    expect(content).toContain('app.post("/items"')
    expect(content).toContain('service.createItem(')
  })
})

describe('coverage: operation with no responses — falls back to default status', () => {
  it('operation without a responses property generates a handler with default c.json()', () => {
    // Covers the `if (responses !== undefined)` false branch in getResponseStatus
    const spec = makeSpec({
      '/items': {
        get: {
          operationId: 'listItems',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any, // no responses property
      },
    })
    const { content } = generateRouter(spec)
    expect(content).toContain('app.get("/items"')
    expect(content).toContain('service.listItems(')
  })
})

describe('coverage: spec with paths=undefined — collectOperations returns empty', () => {
  it('spec without a paths property generates an empty router', () => {
    // Covers the `if (paths === undefined) return []` branch in collectOperations
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Empty', version: '1.0.0' },
      // no paths property
    } as OpenAPIV3_1.Document
    const { content } = generateRouter(spec)
    expect(content).toContain('export function createRouter')
    expect(content).not.toContain('app.get(')
  })
})

describe('coverage: deriveServiceName — spec with no title generates ApiService import', () => {
  it('spec without a title falls back to ApiService in the router service import', () => {
    // Covers `spec.info?.title ?? ''` right side and `pascal.length === 0` true branch
    const spec: OpenAPIV3_1.Document = {
      openapi: '3.1.0',
      info: { version: '1.0.0' } as OpenAPIV3_1.InfoObject,
      paths: {
        '/items': {
          get: { operationId: 'listItems', responses: { '200': { description: 'ok' } } },
        },
      },
    }
    const { content } = generateRouter(spec)
    expect(content).toContain('import type { ApiService }')
  })
})

describe('coverage: sanitizeOperationId — all-punctuation operationId returns unknown', () => {
  it('operationId consisting entirely of non-alphanumeric characters → unknown', () => {
    // Covers `if (parts.length === 0) return 'unknown'` in sanitizeOperationId
    const spec = makeSpec({
      '/items': {
        get: {
          operationId: '---',
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const { content } = generateRouter(spec)
    expect(content).toContain('unknown(')
  })

  it('operationId starting with a digit is prefixed with underscore', () => {
    // Covers `/^[0-9]/.test(camel) ? `_${camel}` : camel` true branch
    const spec = makeSpec({
      '/items': {
        get: {
          operationId: '2getItems',
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const { content } = generateRouter(spec)
    expect(content).toContain('_2getItems(')
  })
})

describe('coverage: schemaNames provided but operation has no body — typeName is undefined branch', () => {
  it('GET operation (no body) alongside a POST when schemaNames is provided covers the typeName=undefined path', () => {
    // Covers the `if (typeName !== undefined)` false branch in schema name collection loop
    const spec = makeSpec({
      '/items': {
        get: {
          operationId: 'listItems',
          responses: { '200': { description: 'ok' } },
        },
        post: {
          operationId: 'createItem',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CreateItemRequest' } },
            },
          },
          responses: { '201': { description: 'created' } },
        },
      },
    })
    const result = generateRouter(spec, {
      schemaNames: new Set(['CreateItemRequestSchema']),
      schemaImportPath: './schemas.js',
    })
    // GET has no body (typeName undefined) and POST has a schema match
    expect(result.content).toContain('CreateItemRequestSchema')
    expect(result.content).toContain('app.get("/items"')
  })
})

// ── Express router tests ───────────────────────────────────────────────────────

describe('generateExpressRouter', () => {
  it('returns a GeneratedFile with filename router.ts', () => {
    const spec = makeSpec({})
    const result = generateExpressRouter(spec)
    expect(result.filename).toBe('router.ts')
  })

  it('output starts with auto-generated header', () => {
    const spec = makeSpec({})
    const result = generateExpressRouter(spec)
    expect(result.content).toMatch(/^\/\/ This file is auto-generated/)
  })

  it('includes express.json() middleware note in header comment', () => {
    const spec = makeSpec({})
    const result = generateExpressRouter(spec)
    expect(result.content).toContain('express.json()')
  })

  it('imports Router from express', () => {
    const spec = makeSpec({})
    const result = generateExpressRouter(spec)
    expect(result.content).toContain("import { Router } from 'express'")
  })

  it('imports Request and Response types from express', () => {
    const spec = makeSpec({})
    const result = generateExpressRouter(spec)
    expect(result.content).toContain("import type { Request, Response } from 'express'")
  })

  it('exports createRouter function returning Router', () => {
    const spec = makeSpec({})
    const result = generateExpressRouter(spec)
    expect(result.content).toContain('export function createRouter(')
    expect(result.content).toContain('): Router {')
  })

  it('GET route uses router.get', () => {
    const spec = makeSpec({
      '/pets': {
        get: {
          operationId: 'listPets',
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const result = generateExpressRouter(spec)
    expect(result.content).toContain('router.get("/pets"')
  })

  it('POST route uses router.post', () => {
    const spec = makeSpec({
      '/pets': {
        post: {
          operationId: 'createPet',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CreatePetRequest' } },
            },
          },
          responses: { '201': { description: 'created' } },
        },
      },
    })
    const result = generateExpressRouter(spec)
    expect(result.content).toContain('router.post("/pets"')
  })

  it('DELETE route uses router.delete', () => {
    const spec = makeSpec({
      '/pets/{id}': {
        delete: {
          operationId: 'deletePet',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '204': { description: 'deleted' } },
        },
      },
    })
    const result = generateExpressRouter(spec)
    expect(result.content).toContain('router.delete("/pets/:id"')
  })

  it('path param {id} becomes :id in route', () => {
    const spec = makeSpec({
      '/pets/{id}': {
        get: {
          operationId: 'getPet',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const result = generateExpressRouter(spec)
    expect(result.content).toContain('router.get("/pets/:id"')
  })

  it('path param extracted via req.params bracket notation with non-null assertion', () => {
    const spec = makeSpec({
      '/pets/{id}': {
        get: {
          operationId: 'getPet',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const result = generateExpressRouter(spec)
    expect(result.content).toContain("req.params['id']!")
  })

  it('query params extracted via req.query bracket notation', () => {
    const spec = makeSpec({
      '/pets': {
        get: {
          operationId: 'listPets',
          parameters: [
            { name: 'species', in: 'query', required: false, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const result = generateExpressRouter(spec)
    expect(result.content).toContain("req.query['species'] as string | undefined")
  })

  it('numeric query param uses Number() coercion', () => {
    const spec = makeSpec({
      '/pets': {
        get: {
          operationId: 'listPets',
          parameters: [
            { name: 'limit', in: 'query', required: false, schema: { type: 'integer' } },
          ],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const result = generateExpressRouter(spec)
    expect(result.content).toContain("Number(req.query['limit'] as string)")
  })

  it('boolean query param uses === true comparison', () => {
    const spec = makeSpec({
      '/pets': {
        get: {
          operationId: 'listPets',
          parameters: [
            { name: 'active', in: 'query', required: false, schema: { type: 'boolean' } },
          ],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const result = generateExpressRouter(spec)
    expect(result.content).toContain("req.query['active'] === 'true'")
  })

  it('POST extracts body from req.body with type cast', () => {
    const spec = makeSpec({
      '/pets': {
        post: {
          operationId: 'createPet',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CreatePetRequest' } },
            },
          },
          responses: { '201': { description: 'created' } },
        },
      },
    })
    const result = generateExpressRouter(spec)
    expect(result.content).toContain('req.body as CreatePetRequest')
  })

  it('imports body type from models.js when typed body used', () => {
    const spec = makeSpec({
      '/pets': {
        post: {
          operationId: 'createPet',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CreatePetRequest' } },
            },
          },
          responses: { '201': { description: 'created' } },
        },
      },
    })
    const result = generateExpressRouter(spec)
    expect(result.content).toContain("import type { CreatePetRequest } from './models.js'")
  })

  it('no models import when no typed body', () => {
    const spec = makeSpec({
      '/pets': {
        get: {
          operationId: 'listPets',
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const result = generateExpressRouter(spec)
    expect(result.content).not.toContain("from './models.js'")
  })

  it('POST with 201 response uses res.status(201).json()', () => {
    const spec = makeSpec({
      '/pets': {
        post: {
          operationId: 'createPet',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: {
            '201': {
              description: 'created',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
            },
          },
        },
      },
    })
    const result = generateExpressRouter(spec)
    expect(result.content).toContain('res.status(201).json(await service.createPet(')
  })

  it('DELETE with 204 uses res.status(204).end()', () => {
    const spec = makeSpec({
      '/pets/{id}': {
        delete: {
          operationId: 'deletePet',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '204': { description: 'deleted' } },
        },
      },
    })
    const result = generateExpressRouter(spec)
    expect(result.content).toContain('res.status(204).end()')
  })

  it('POST with only 202 declared emits res.status(202).json()', () => {
    // Bug #9: when the single declared 2xx is not 200/201/204, honor that code.
    const spec = makeSpec({
      '/jobs': {
        post: {
          operationId: 'enqueueJob',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: {
            '202': {
              description: 'accepted',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Job' } } },
            },
          },
        },
      },
    })
    const result = generateExpressRouter(spec)
    expect(result.content).toContain('res.status(202).json(await service.enqueueJob(')
  })

  it('Bug #10 — GET with 200+202 declared emits envelope dispatch: res.status(_envelope.status).json(_envelope.body)', () => {
    // Bug #10: when multiple 2xx are declared, the service returns { status, body }
    // and the router forwards both so the handler can select the status at runtime.
    const spec = makeSpec({
      '/tasks/{id}': {
        get: {
          operationId: 'getTask',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'done',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Task' } } },
            },
            '202': {
              description: 'still running',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Task' } } },
            },
          },
        },
      },
    })
    const result = generateExpressRouter(spec)
    expect(result.content).toContain('const _envelope = await service.getTask(')
    expect(result.content).toContain('res.status(_envelope.status).json(_envelope.body)')
    // Must NOT use the old single-status path
    expect(result.content).not.toContain('res.json(await service.getTask(')
  })

  it('GET with 200 uses res.json()', () => {
    const spec = makeSpec({
      '/pets': {
        get: {
          operationId: 'listPets',
          responses: {
            '200': {
              description: 'ok',
              content: { 'application/json': { schema: { type: 'array', items: {} } } },
            },
          },
        },
      },
    })
    const result = generateExpressRouter(spec)
    expect(result.content).toContain('res.json(await service.listPets(')
  })

  it('returns empty Express router when no operations', () => {
    const spec = makeSpec({})
    const result = generateExpressRouter(spec)
    expect(result.content).toContain('const router = Router()')
    expect(result.content).toContain('return router')
  })
})

// ── Fastify router tests ───────────────────────────────────────────────────────

describe('generateFastifyRouter', () => {
  it('returns a GeneratedFile with filename router.ts', () => {
    const spec = makeSpec({})
    const result = generateFastifyRouter(spec)
    expect(result.filename).toBe('router.ts')
  })

  it('output starts with auto-generated header', () => {
    const spec = makeSpec({})
    const result = generateFastifyRouter(spec)
    expect(result.content).toMatch(/^\/\/ This file is auto-generated/)
  })

  it('imports FastifyInstance from fastify', () => {
    const spec = makeSpec({})
    const result = generateFastifyRouter(spec)
    expect(result.content).toContain("import type { FastifyInstance } from 'fastify'")
  })

  it('exports createRouter function with void return type', () => {
    const spec = makeSpec({})
    const result = generateFastifyRouter(spec)
    expect(result.content).toContain('export function createRouter(')
    expect(result.content).toContain('FastifyInstance')
    expect(result.content).toContain('): void {')
  })

  it('GET route uses app.get', () => {
    const spec = makeSpec({
      '/pets': {
        get: {
          operationId: 'listPets',
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const result = generateFastifyRouter(spec)
    expect(result.content).toContain('app.get')
    expect(result.content).toContain('"/pets"')
  })

  it('POST route uses app.post', () => {
    const spec = makeSpec({
      '/pets': {
        post: {
          operationId: 'createPet',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CreatePetRequest' } },
            },
          },
          responses: { '201': { description: 'created' } },
        },
      },
    })
    const result = generateFastifyRouter(spec)
    expect(result.content).toContain('app.post')
    expect(result.content).toContain('"/pets"')
  })

  it('DELETE route uses app.delete', () => {
    const spec = makeSpec({
      '/pets/{id}': {
        delete: {
          operationId: 'deletePet',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '204': { description: 'deleted' } },
        },
      },
    })
    const result = generateFastifyRouter(spec)
    expect(result.content).toContain('app.delete')
    expect(result.content).toContain('"/pets/:id"')
  })

  it('path param extracted via req.params dot notation', () => {
    const spec = makeSpec({
      '/pets/{id}': {
        get: {
          operationId: 'getPet',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const result = generateFastifyRouter(spec)
    expect(result.content).toContain('req.params.id')
  })

  it('path param generates Params generic', () => {
    const spec = makeSpec({
      '/pets/{id}': {
        get: {
          operationId: 'getPet',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const result = generateFastifyRouter(spec)
    expect(result.content).toContain('Params:')
    expect(result.content).toContain('id: string')
  })

  it('query params extracted via req.query dot notation', () => {
    const spec = makeSpec({
      '/pets': {
        get: {
          operationId: 'listPets',
          parameters: [
            { name: 'species', in: 'query', required: false, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const result = generateFastifyRouter(spec)
    expect(result.content).toContain('req.query.species')
  })

  it('query params generate Querystring generic', () => {
    const spec = makeSpec({
      '/pets': {
        get: {
          operationId: 'listPets',
          parameters: [
            { name: 'species', in: 'query', required: false, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const result = generateFastifyRouter(spec)
    expect(result.content).toContain('Querystring:')
    expect(result.content).toContain('species?: string')
  })

  it('POST body extracted via req.body with Body generic', () => {
    const spec = makeSpec({
      '/pets': {
        post: {
          operationId: 'createPet',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CreatePetRequest' } },
            },
          },
          responses: { '201': { description: 'created' } },
        },
      },
    })
    const result = generateFastifyRouter(spec)
    expect(result.content).toContain('req.body')
    expect(result.content).toContain('Body: CreatePetRequest')
  })

  it('imports body type from models.js when typed body used', () => {
    const spec = makeSpec({
      '/pets': {
        post: {
          operationId: 'createPet',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CreatePetRequest' } },
            },
          },
          responses: { '201': { description: 'created' } },
        },
      },
    })
    const result = generateFastifyRouter(spec)
    expect(result.content).toContain("import type { CreatePetRequest } from './models.js'")
  })

  it('no models import when no typed body', () => {
    const spec = makeSpec({
      '/pets': {
        get: {
          operationId: 'listPets',
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const result = generateFastifyRouter(spec)
    expect(result.content).not.toContain("from './models.js'")
  })

  it('POST with 201 uses reply.status(201) then return', () => {
    const spec = makeSpec({
      '/pets': {
        post: {
          operationId: 'createPet',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: {
            '201': {
              description: 'created',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
            },
          },
        },
      },
    })
    const result = generateFastifyRouter(spec)
    expect(result.content).toContain('reply.status(201)')
    expect(result.content).toContain('return service.createPet(')
  })

  it('DELETE with 204 uses reply.status(204).send()', () => {
    const spec = makeSpec({
      '/pets/{id}': {
        delete: {
          operationId: 'deletePet',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '204': { description: 'deleted' } },
        },
      },
    })
    const result = generateFastifyRouter(spec)
    expect(result.content).toContain('reply.status(204).send()')
  })

  it('POST with only 202 declared emits reply.status(202) then return', () => {
    // Bug #9: when the single declared 2xx is not 200/201/204, honor that code.
    const spec = makeSpec({
      '/jobs': {
        post: {
          operationId: 'enqueueJob',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: {
            '202': {
              description: 'accepted',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Job' } } },
            },
          },
        },
      },
    })
    const result = generateFastifyRouter(spec)
    expect(result.content).toContain('reply.status(202)')
    expect(result.content).toContain('return service.enqueueJob(')
  })

  it('Bug #10 — GET with 200+202 declared emits envelope dispatch: reply.status(_envelope.status).send(_envelope.body)', () => {
    // Bug #10: when multiple 2xx are declared, the service returns { status, body }
    // and the router forwards both so the handler can select the status at runtime.
    const spec = makeSpec({
      '/tasks/{id}': {
        get: {
          operationId: 'getTask',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'done',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Task' } } },
            },
            '202': {
              description: 'still running',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Task' } } },
            },
          },
        },
      },
    })
    const result = generateFastifyRouter(spec)
    expect(result.content).toContain('const _envelope = await service.getTask(')
    expect(result.content).toContain('reply.status(_envelope.status).send(_envelope.body)')
    // Must NOT use the old single-status path
    expect(result.content).not.toContain('reply.status(200)')
    expect(result.content).not.toContain('reply.status(202)')
  })

  it('GET with 200 uses return (Fastify auto-serializes)', () => {
    const spec = makeSpec({
      '/pets': {
        get: {
          operationId: 'listPets',
          responses: {
            '200': {
              description: 'ok',
              content: { 'application/json': { schema: { type: 'array', items: {} } } },
            },
          },
        },
      },
    })
    const result = generateFastifyRouter(spec)
    expect(result.content).toContain('return service.listPets(')
  })

  it('route with no params has no generic type argument', () => {
    const spec = makeSpec({
      '/health': {
        get: {
          operationId: 'getHealth',
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const result = generateFastifyRouter(spec)
    // No generics when no params/query/body
    expect(result.content).toContain('app.get("/health"')
    expect(result.content).not.toContain('app.get<')
  })

  it('returns empty void router when no operations', () => {
    const spec = makeSpec({})
    const result = generateFastifyRouter(spec)
    expect(result.content).toContain('): void {')
    expect(result.content).not.toContain('app.get(')
  })
})

// ── Express Zod validation tests ──────────────────────────────────────────────

describe('generateExpressRouter with schemaNames (Zod validation)', () => {
  const postSpec = makeSpec({
    '/pets': {
      post: {
        operationId: 'createPet',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreatePetRequest' } },
          },
        },
        responses: { '201': { description: 'created' } },
      },
    },
  })

  it('adds safeParse validation when schema is in schemaNames', () => {
    const result = generateExpressRouter(postSpec, {
      schemaNames: new Set(['CreatePetRequestSchema']),
      schemaImportPath: './schemas.js',
    })
    expect(result.content).toContain('CreatePetRequestSchema.safeParse(req.body)')
    expect(result.content).toContain('parseResult.success')
    expect(result.content).toContain('422')
  })

  it('uses parseResult.data in service call when schema is present', () => {
    const result = generateExpressRouter(postSpec, {
      schemaNames: new Set(['CreatePetRequestSchema']),
      schemaImportPath: './schemas.js',
    })
    expect(result.content).toContain('parseResult.data')
    expect(result.content).toContain('service.createPet(validatedBody')
  })

  it('returns 422 with void to suppress return-type error', () => {
    const result = generateExpressRouter(postSpec, {
      schemaNames: new Set(['CreatePetRequestSchema']),
      schemaImportPath: './schemas.js',
    })
    expect(result.content).toContain('return void res.status(422).json(')
    expect(result.content).toContain("error: 'Invalid request body'")
    expect(result.content).toContain('parseResult.error.issues')
  })

  it('imports schema and z from schemaImportPath', () => {
    const result = generateExpressRouter(postSpec, {
      schemaNames: new Set(['CreatePetRequestSchema']),
      schemaImportPath: './schemas.js',
    })
    expect(result.content).toContain("import { z } from 'zod'")
    expect(result.content).toContain("import { CreatePetRequestSchema } from './schemas.js'")
  })

  it('falls back to plain body cast when schemaNames does not match', () => {
    const result = generateExpressRouter(postSpec, {
      schemaNames: new Set(['SomeOtherSchema']),
      schemaImportPath: './schemas.js',
    })
    expect(result.content).not.toContain('safeParse')
    expect(result.content).toContain('req.body as CreatePetRequest')
  })

  it('falls back to plain body cast when options is undefined', () => {
    const result = generateExpressRouter(postSpec)
    expect(result.content).not.toContain('safeParse')
    expect(result.content).toContain('req.body as CreatePetRequest')
    expect(result.content).toContain('service.createPet(body')
  })
})

// ── Fastify Zod validation tests ──────────────────────────────────────────────

describe('generateFastifyRouter with schemaNames (Zod validation)', () => {
  const postSpec = makeSpec({
    '/pets': {
      post: {
        operationId: 'createPet',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreatePetRequest' } },
          },
        },
        responses: { '201': { description: 'created' } },
      },
    },
  })

  it('adds safeParse validation when schema is in schemaNames', () => {
    const result = generateFastifyRouter(postSpec, {
      schemaNames: new Set(['CreatePetRequestSchema']),
      schemaImportPath: './schemas.js',
    })
    expect(result.content).toContain('CreatePetRequestSchema.safeParse(req.body)')
    expect(result.content).toContain('parseResult.success')
    expect(result.content).toContain('422')
  })

  it('uses parseResult.data in service call when schema is present', () => {
    const result = generateFastifyRouter(postSpec, {
      schemaNames: new Set(['CreatePetRequestSchema']),
      schemaImportPath: './schemas.js',
    })
    expect(result.content).toContain('parseResult.data')
    expect(result.content).toContain('service.createPet(parseResult.data')
  })

  it('returns 422 via reply.status(422).send()', () => {
    const result = generateFastifyRouter(postSpec, {
      schemaNames: new Set(['CreatePetRequestSchema']),
      schemaImportPath: './schemas.js',
    })
    expect(result.content).toContain('return reply.status(422).send(')
    expect(result.content).toContain("error: 'Invalid request body'")
    expect(result.content).toContain('parseResult.error.issues')
  })

  it('imports schema and z from schemaImportPath', () => {
    const result = generateFastifyRouter(postSpec, {
      schemaNames: new Set(['CreatePetRequestSchema']),
      schemaImportPath: './schemas.js',
    })
    expect(result.content).toContain("import { z } from 'zod'")
    expect(result.content).toContain("import { CreatePetRequestSchema } from './schemas.js'")
  })

  it('falls back to req.body when schemaNames does not match', () => {
    const result = generateFastifyRouter(postSpec, {
      schemaNames: new Set(['SomeOtherSchema']),
      schemaImportPath: './schemas.js',
    })
    expect(result.content).not.toContain('safeParse')
    expect(result.content).toContain('service.createPet(req.body')
  })

  it('falls back to req.body when options is undefined', () => {
    const result = generateFastifyRouter(postSpec)
    expect(result.content).not.toContain('safeParse')
    expect(result.content).toContain('service.createPet(req.body')
  })
})

// ── Bug-fix tests: Bug 1 — malformed body returns 400 ─────────────────────────
// Verifies that the Hono generator uses JSON.parse(c.req.text()) instead of
// c.req.json() — because Hono's c.req.json() silently returns null for an empty
// body instead of throwing, causing a 422 from Zod instead of the correct 400.
// JSON.parse('') always throws SyntaxError, so empty and malformed bodies both
// hit the catch block and return 400.

describe('Bug 1 — Hono: malformed/empty JSON body returns 400 instead of 500/422', () => {
  const postSpec = makeSpec({
    '/pets': {
      post: {
        operationId: 'createPet',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreatePetRequest' } },
          },
        },
        responses: { '201': { description: 'created' } },
      },
    },
  })

  it('Hono: body extraction uses JSON.parse(c.req.text()) wrapped in try/catch', () => {
    const { content } = generateRouter(postSpec)
    expect(content).toContain('try {')
    expect(content).toContain('body = JSON.parse(await c.req.text()) as CreatePetRequest')
    expect(content).toContain('} catch {')
    expect(content).toContain("return c.json({ error: 'Invalid JSON body' }, 400)")
  })

  it('Hono: body is declared with let before the try block (not const)', () => {
    const { content } = generateRouter(postSpec)
    expect(content).toContain('let body: CreatePetRequest')
    expect(content).not.toContain('const body =')
  })

  it('Hono: untyped inline body also uses JSON.parse(c.req.text()) wrapped in try/catch', () => {
    const inlineSpec = makeSpec({
      '/items': {
        post: {
          operationId: 'createItem',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const { content } = generateRouter(inlineSpec)
    expect(content).toContain('let body: unknown')
    expect(content).toContain('body = JSON.parse(await c.req.text()) as unknown')
    expect(content).toContain("return c.json({ error: 'Invalid JSON body' }, 400)")
  })

  it('Hono: GET routes without a body do not emit the body try/catch', () => {
    const getSpec = makeSpec({
      '/pets': {
        get: {
          operationId: 'listPets',
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const { content } = generateRouter(getSpec)
    expect(content).not.toContain('Invalid JSON body')
    expect(content).not.toContain('let body:')
  })
})

// ── Bug-fix tests: Bug 2 — wrong Content-Type returns 415 ────────────────────
// Verifies that the Hono generator emits a Content-Type guard that rejects
// requests whose Content-Type does not start with application/json with 415.

describe('Bug 2 — Hono: non-JSON Content-Type returns 415 instead of parsing anyway', () => {
  const postSpec = makeSpec({
    '/pets': {
      post: {
        operationId: 'createPet',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreatePetRequest' } },
          },
        },
        responses: { '201': { description: 'created' } },
      },
    },
  })

  it('Hono: emits Content-Type check using c.req.header("content-type")', () => {
    const { content } = generateRouter(postSpec)
    expect(content).toContain("c.req.header('content-type')")
    expect(content).toContain("startsWith('application/json')")
    expect(content).toContain("return c.json({ error: 'Unsupported Media Type' }, 415)")
  })

  it('Hono: Content-Type check appears before the body try/catch', () => {
    const { content } = generateRouter(postSpec)
    const ctPos = content.indexOf("startsWith('application/json')")
    const tryPos = content.indexOf('JSON.parse(await c.req.text())')
    expect(ctPos).toBeGreaterThan(0)
    expect(tryPos).toBeGreaterThan(0)
    expect(ctPos).toBeLessThan(tryPos)
  })

  it('Hono: GET routes do not emit Content-Type check', () => {
    const getSpec = makeSpec({
      '/pets': {
        get: {
          operationId: 'listPets',
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const { content } = generateRouter(getSpec)
    expect(content).not.toContain('Unsupported Media Type')
    expect(content).not.toContain('_ct')
  })
})

// ── Bug-fix tests: Bug 3 — HttpError maps to declared status ─────────────────
// Verifies that all three framework generators emit an exported HttpError class
// and wrap service calls in try/catch to map HttpError instances to their status.

describe('Bug 3 — all frameworks: exported HttpError + service try/catch maps to status', () => {
  const spec = makeSpec({
    '/pets/{id}': {
      get: {
        operationId: 'getPet',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'ok' } },
      },
      delete: {
        operationId: 'deletePet',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '204': { description: 'deleted' } },
      },
    },
  })

  it('Hono: emits exported HttpError class', () => {
    const { content } = generateRouter(spec)
    expect(content).toContain('export class HttpError extends Error')
    expect(content).toContain('public readonly status: number')
    expect(content).toContain("this.name = 'HttpError'")
  })

  it('Hono: GET service call wrapped in try/catch with HttpError mapping', () => {
    const { content } = generateRouter(spec)
    expect(content).toContain('if (err instanceof HttpError)')
    expect(content).toContain("{ status: err.status, headers: { 'content-type': 'application/json' } }")
    expect(content).toContain('throw err')
  })

  it('Hono: 204 void route also wrapped in try/catch', () => {
    const { content } = generateRouter(spec)
    expect(content).toContain('new Response(null, { status: 204 })')
    expect(content).toContain('if (err instanceof HttpError)')
  })

  it('Express: emits exported HttpError class', () => {
    const { content } = generateExpressRouter(spec)
    expect(content).toContain('export class HttpError extends Error')
    expect(content).toContain('public readonly status: number')
  })

  it('Express: GET service call wrapped in try/catch with HttpError mapping', () => {
    const { content } = generateExpressRouter(spec)
    expect(content).toContain('if (err instanceof HttpError)')
    expect(content).toContain('return void res.status(err.status).json({ error: err.message })')
    expect(content).toContain('throw err')
  })

  it('Fastify: emits exported HttpError class', () => {
    const { content } = generateFastifyRouter(spec)
    expect(content).toContain('export class HttpError extends Error')
    expect(content).toContain('public readonly status: number')
  })

  it('Fastify: GET service call wrapped in try/catch with HttpError mapping', () => {
    const { content } = generateFastifyRouter(spec)
    expect(content).toContain('if (err instanceof HttpError)')
    expect(content).toContain('return reply.status(err.status).send({ error: err.message })')
    expect(content).toContain('throw err')
  })
})

// ── Bug #1: inline (non-$ref) JSON request body gets safeParse wired ─────────

describe('bug #1 fix: inline JSON request body synthesizes schema name from operationId', () => {
  const inlineSpec = makeSpec({
    '/lab/inline-body': {
      post: {
        operationId: 'labInlineBody',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'rank'],
                properties: {
                  title: { type: 'string', minLength: 2 },
                  rank: { type: 'integer', minimum: 1, maximum: 5 },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'echoed' } },
      },
    },
  })

  it('Hono: synthesizes LabInlineBodySchema name and wires safeParse when schema present', () => {
    const { content } = generateRouter(inlineSpec, {
      schemaNames: new Set(['LabInlineBodySchema']),
      schemaImportPath: './schemas.js',
    })
    expect(content).toContain('LabInlineBodySchema.safeParse(body)')
    expect(content).toContain('parseResult.success')
    expect(content).toContain('422')
    // Synthesized name must NOT appear in model type import (no models.ts entry)
    expect(content).not.toContain("import type { LabInlineBody }")
  })

  it('Hono: body variable is typed as unknown (synthesized, not a model type)', () => {
    const { content } = generateRouter(inlineSpec, {
      schemaNames: new Set(['LabInlineBodySchema']),
      schemaImportPath: './schemas.js',
    })
    // Type declaration for the body parse variable must be unknown, not LabInlineBody
    expect(content).toContain('let body: unknown')
    expect(content).not.toContain('let body: LabInlineBody')
  })

  it('Hono: uses validatedBody in service call when inline schema is matched', () => {
    const { content } = generateRouter(inlineSpec, {
      schemaNames: new Set(['LabInlineBodySchema']),
      schemaImportPath: './schemas.js',
    })
    expect(content).toContain('service.labInlineBody(validatedBody')
  })

  it('Hono: no safeParse emitted when LabInlineBodySchema not in schemaNames', () => {
    const { content } = generateRouter(inlineSpec)
    expect(content).not.toContain('safeParse')
    expect(content).toContain('service.labInlineBody(body')
  })

  it('Express: synthesizes LabInlineBodySchema name and wires safeParse when schema present', () => {
    const { content } = generateExpressRouter(inlineSpec, {
      schemaNames: new Set(['LabInlineBodySchema']),
      schemaImportPath: './schemas.js',
    })
    expect(content).toContain('LabInlineBodySchema.safeParse(req.body)')
    expect(content).toContain('422')
    expect(content).not.toContain("import type { LabInlineBody }")
  })

  it('Fastify: synthesizes LabInlineBodySchema name and wires safeParse when schema present', () => {
    const { content } = generateFastifyRouter(inlineSpec, {
      schemaNames: new Set(['LabInlineBodySchema']),
      schemaImportPath: './schemas.js',
    })
    expect(content).toContain('LabInlineBodySchema.safeParse(req.body)')
    expect(content).toContain('422')
    // Synthesized name must not leak into Fastify generic type (uses unknown instead)
    expect(content).not.toContain('Body: LabInlineBody')
    expect(content).toContain('Body: unknown')
  })
})

// ── Bug #7 fix: application/x-www-form-urlencoded body decoded via parseBody() ─

describe('bug #7 fix: form-urlencoded request body uses parseBody() not JSON.parse()', () => {
  const formSpec = makeSpec({
    '/lab/form-body': {
      post: {
        operationId: 'labFormBody',
        requestBody: {
          required: true,
          content: {
            'application/x-www-form-urlencoded': {
              schema: {
                type: 'object',
                required: ['label', 'quantity'],
                properties: {
                  label: { type: 'string' },
                  quantity: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'echoed' } },
      },
    },
  })

  it('Hono: emits parseBody() for form-urlencoded body, not JSON.parse()', () => {
    const { content } = generateRouter(formSpec)
    expect(content).toContain('c.req.parseBody()')
    expect(content).not.toContain('JSON.parse(await c.req.text())')
  })

  it('Hono: checks for application/x-www-form-urlencoded Content-Type', () => {
    const { content } = generateRouter(formSpec)
    expect(content).toContain('application/x-www-form-urlencoded')
    expect(content).not.toContain("startsWith('application/json')")
  })

  it('Hono: synthesizes LabFormBodySchema name and wires safeParse when schema present', () => {
    const { content } = generateRouter(formSpec, {
      schemaNames: new Set(['LabFormBodySchema']),
      schemaImportPath: './schemas.js',
    })
    expect(content).toContain('LabFormBodySchema.safeParse(body)')
    expect(content).toContain('parseResult.success')
    expect(content).toContain('422')
    // Synthesized name must NOT appear in model type import
    expect(content).not.toContain("import type { LabFormBody }")
  })

  it('Hono: uses validatedBody in service call when form schema is matched', () => {
    const { content } = generateRouter(formSpec, {
      schemaNames: new Set(['LabFormBodySchema']),
      schemaImportPath: './schemas.js',
    })
    expect(content).toContain('service.labFormBody(validatedBody')
  })

  it('Express: form-urlencoded body uses req.body (pre-parsed by express.urlencoded middleware)', () => {
    const { content } = generateExpressRouter(formSpec, {
      schemaNames: new Set(['LabFormBodySchema']),
      schemaImportPath: './schemas.js',
    })
    // Express pre-parses form body into req.body — same code path as JSON
    expect(content).toContain('LabFormBodySchema.safeParse(req.body)')
    expect(content).toContain('422')
  })

  it('Fastify: form-urlencoded body uses req.body (pre-parsed by fastify plugin)', () => {
    const { content } = generateFastifyRouter(formSpec, {
      schemaNames: new Set(['LabFormBodySchema']),
      schemaImportPath: './schemas.js',
    })
    expect(content).toContain('LabFormBodySchema.safeParse(req.body)')
    expect(content).toContain('422')
  })
})

// ── Bug #11 fix: non-JSON responses (text/plain + octet-stream) ───────────────

describe('bug #11 fix: text/plain and application/octet-stream responses', () => {
  const textSpec = makeSpec({
    '/lab/plain-text': {
      get: {
        operationId: 'labPlainText',
        responses: {
          '200': {
            description: 'plain text',
            content: { 'text/plain': { schema: { type: 'string' } } },
          },
        },
      },
    },
  })

  const binarySpec = makeSpec({
    '/lab/download': {
      get: {
        operationId: 'labDownload',
        responses: {
          '200': {
            description: 'binary download',
            content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
          },
        },
      },
    },
  })

  // ── text/plain ──────────────────────────────────────────────────────────────

  it('Hono: text/plain response emits c.text() not c.json()', () => {
    const { content } = generateRouter(textSpec)
    expect(content).toContain('c.text(')
    expect(content).not.toContain('c.json(await service.labPlainText')
  })

  it('Hono: text/plain response does NOT call c.json()', () => {
    const { content } = generateRouter(textSpec)
    // No c.json call for the service result
    expect(content).not.toContain('c.json(await service.labPlainText')
  })

  it('Express: text/plain response emits res.type("text/plain").send()', () => {
    const { content } = generateExpressRouter(textSpec)
    expect(content).toContain("res.type('text/plain')")
    expect(content).not.toContain('res.json(')
  })

  it('Fastify: text/plain response emits reply.type("text/plain").send()', () => {
    const { content } = generateFastifyRouter(textSpec)
    expect(content).toContain("reply.type('text/plain')")
    expect(content).not.toContain('return service.labPlainText')
  })

  // ── application/octet-stream ───────────────────────────────────────────────

  it('Hono: octet-stream response emits new Response with application/octet-stream header', () => {
    const { content } = generateRouter(binarySpec)
    expect(content).toContain('application/octet-stream')
    expect(content).not.toContain('c.json(await service.labDownload')
  })

  it('Express: octet-stream response emits setHeader + Buffer.from().send()', () => {
    const { content } = generateExpressRouter(binarySpec)
    expect(content).toContain("setHeader('Content-Type', 'application/octet-stream')")
    expect(content).toContain('Buffer.from(')
    expect(content).not.toContain('res.json(')
  })

  it('Fastify: octet-stream response emits reply.type("application/octet-stream").send()', () => {
    const { content } = generateFastifyRouter(binarySpec)
    expect(content).toContain("reply.type('application/octet-stream')")
    expect(content).toContain('Buffer.from(')
  })

  // ── JSON path unaffected ───────────────────────────────────────────────────

  it('Hono: JSON response still uses c.json()', () => {
    const jsonSpec = makeSpec({
      '/pets': {
        get: {
          operationId: 'listPets',
          responses: {
            '200': {
              description: 'ok',
              content: {
                'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Pet' } } },
              },
            },
          },
        },
      },
    })
    const { content } = generateRouter(jsonSpec)
    expect(content).toContain('c.json(await service.listPets')
    expect(content).not.toContain('c.text(')
  })
})

// ── Bug #8 fix: multipart/form-data request bodies decoded via parseBody({ all: true }) ──

describe('bug #8 fix: multipart/form-data request body uses parseBody({ all: true })', () => {
  const multipartSpec = makeSpec({
    '/lab/gallery': {
      post: {
        operationId: 'labGallery',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['photos'],
                properties: {
                  photos: {
                    type: 'array',
                    items: { type: 'string', format: 'binary' },
                  },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'upload ack' } },
      },
    },
  })

  it('Hono: emits parseBody({ all: true }) for multipart body, not JSON.parse()', () => {
    const { content } = generateRouter(multipartSpec)
    expect(content).toContain('parseBody({ all: true })')
    expect(content).not.toContain('JSON.parse(await c.req.text())')
  })

  it('Hono: does NOT check for application/json Content-Type for multipart body', () => {
    const { content } = generateRouter(multipartSpec)
    expect(content).not.toContain("startsWith('application/json')")
  })

  it('Hono: does NOT emit the Unsupported Media Type 415 guard for multipart body', () => {
    const { content } = generateRouter(multipartSpec)
    // The multipart path skips the content-type check entirely; no 415 guard
    // should be emitted for this operation.
    const gallerySection = content.slice(content.indexOf('/lab/gallery'))
    expect(gallerySection.slice(0, gallerySection.indexOf('\n  })'))).not.toContain('415')
  })

  it('Hono: forwards multipart body to the service call', () => {
    const { content } = generateRouter(multipartSpec)
    expect(content).toContain('service.labGallery(body)')
  })

  it('Express: multipart body uses req.files + req.body merge (assumes multer middleware)', () => {
    const { content } = generateExpressRouter(multipartSpec)
    expect(content).toContain('req.files')
    expect(content).toContain('req.body')
    // Should not attempt JSON parsing
    expect(content).not.toContain('JSON.parse')
  })

  it('Fastify: multipart body uses req.body (assumes @fastify/multipart plugin)', () => {
    const { content } = generateFastifyRouter(multipartSpec)
    // Should reference req.body for the service call
    expect(content).toContain('req.body')
    // Should not attempt JSON parsing
    expect(content).not.toContain('JSON.parse')
  })

  it('all three frameworks generate without throwing', () => {
    expect(() => generateRouter(multipartSpec)).not.toThrow()
    expect(() => generateExpressRouter(multipartSpec)).not.toThrow()
    expect(() => generateFastifyRouter(multipartSpec)).not.toThrow()
  })
})

// ── Context type (issue #310) ─────────────────────────────────────────────────

describe('context type option (issue #310)', () => {
  const petSpec = makeSpec({
    '/pets': {
      get: {
        operationId: 'listPets',
        responses: {
          '200': {
            description: 'ok',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
          },
        },
      },
      post: {
        operationId: 'createPet',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreatePetRequest' } } },
        },
        responses: { '201': { description: 'created' } },
      },
    },
    '/pets/{id}': {
      get: {
        operationId: 'getPet',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'ok',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
          },
        },
      },
    },
  })

  describe('Hono — no contextType (backward compat)', () => {
    it('createRouter signature does not include a generic type arg', () => {
      const { content } = generateRouter(petSpec)
      // PetStoreService (no generic) must appear in the factory signature
      expect(content).toContain('createRouter(service: PetStoreService): Hono')
      expect(content).not.toContain('PetStoreService<')
    })

    it('service calls do NOT include c as an extra arg', () => {
      const { content } = generateRouter(petSpec)
      expect(content).toContain('service.listPets(')
      // Verify c is not passed as ctx: the call must not end with ", c)"
      expect(content).not.toMatch(/service\.listPets\([^)]*,\s*c\)/)
    })
  })

  describe('Hono — with contextType', () => {
    it('createRouter signature uses the generic service reference', () => {
      const { content } = generateRouter(petSpec, { contextType: 'RequestContext' })
      expect(content).toContain('createRouter(service: PetStoreService<RequestContext>): Hono')
    })

    it('service calls pass c as the final argument (no other args for GET /pets)', () => {
      const { content } = generateRouter(petSpec, { contextType: 'RequestContext' })
      // service.listPets(c) — only arg is c
      expect(content).toContain('service.listPets(c)')
    })

    it('service call with path param passes path param then c', () => {
      const { content } = generateRouter(petSpec, { contextType: 'RequestContext' })
      expect(content).toContain('service.getPet(c.req.param("id"), c)')
    })

    it('service call with body passes body then c', () => {
      const { content } = generateRouter(petSpec, { contextType: 'RequestContext' })
      expect(content).toContain('service.createPet(body, c)')
    })
  })

  describe('Express — with contextType', () => {
    it('createRouter signature uses the generic service reference', () => {
      const { content } = generateExpressRouter(petSpec, { contextType: 'RequestContext' })
      expect(content).toContain('createRouter(service: PetStoreService<RequestContext>): Router')
    })

    it('service calls pass req as the final argument (only arg for GET /pets)', () => {
      const { content } = generateExpressRouter(petSpec, { contextType: 'RequestContext' })
      expect(content).toContain('service.listPets(req)')
    })
  })

  describe('Express — no contextType (backward compat)', () => {
    it('service calls do NOT include req as an extra ctx arg', () => {
      const { content } = generateExpressRouter(petSpec)
      // GET /pets has no path params, body, or query — service call has no args at all
      expect(content).toContain('service.listPets()')
    })
  })

  describe('Fastify — with contextType', () => {
    it('createRouter signature uses the generic service reference', () => {
      const { content } = generateFastifyRouter(petSpec, { contextType: 'RequestContext' })
      expect(content).toContain(
        'createRouter(app: FastifyInstance, service: PetStoreService<RequestContext>): void'
      )
    })

    it('service calls pass req as the final argument (only arg for GET /pets)', () => {
      const { content } = generateFastifyRouter(petSpec, { contextType: 'RequestContext' })
      expect(content).toContain('service.listPets(req)')
    })
  })

  describe('Fastify — no contextType (backward compat)', () => {
    it('service calls do NOT include req as an extra ctx arg', () => {
      const { content } = generateFastifyRouter(petSpec)
      // GET /pets has no path params, body, or query — service call has no args
      expect(content).toContain('service.listPets()')
    })
  })
})

// ── Issue #308: Fastify schema.response for runtime response validation ─────────

describe('issue #308: Fastify schema.response wiring', () => {
  const getPetSpec = makeSpec({
    '/pets/{id}': {
      get: {
        operationId: 'getPet',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'ok',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
          },
        },
      },
    },
  })

  const listPetsSpec = makeSpec({
    '/pets': {
      get: {
        operationId: 'listPets',
        responses: {
          '200': {
            description: 'ok',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Pet' } },
              },
            },
          },
        },
      },
    },
  })

  const noSchemaSpec = makeSpec({
    '/pets/{id}': {
      get: {
        operationId: 'getPet',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'ok',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
          },
        },
      },
    },
  })

  it('direct $ref response: emits schema.response with TypeSchema when schema is in schemaNames', () => {
    const { content } = generateFastifyRouter(getPetSpec, {
      schemaNames: new Set(['PetSchema']),
      schemaImportPath: './schemas.js',
    })
    expect(content).toContain('schema: { response: { 200: PetSchema } }')
  })

  it('direct $ref response: schema.response appears in the route registration options', () => {
    const { content } = generateFastifyRouter(getPetSpec, {
      schemaNames: new Set(['PetSchema']),
      schemaImportPath: './schemas.js',
    })
    // The options object must be between the path and the handler
    expect(content).toMatch(/app\.get<[^>]+>\("\/pets\/:id", \{ schema:/)
  })

  it('array-of-$ref response: emits z.array(TypeSchema) in schema.response', () => {
    const { content } = generateFastifyRouter(listPetsSpec, {
      schemaNames: new Set(['PetSchema']),
      schemaImportPath: './schemas.js',
    })
    expect(content).toContain('schema: { response: { 200: z.array(PetSchema) } }')
  })

  it('array response schema: imports z from zod for z.array() expression', () => {
    const { content } = generateFastifyRouter(listPetsSpec, {
      schemaNames: new Set(['PetSchema']),
      schemaImportPath: './schemas.js',
    })
    expect(content).toContain("import { z } from 'zod'")
  })

  it('no schema in schemaNames: route uses two-argument form without options object', () => {
    const { content } = generateFastifyRouter(noSchemaSpec, {
      schemaNames: new Set(['SomeOtherSchema']),
      schemaImportPath: './schemas.js',
    })
    expect(content).not.toContain('schema: { response:')
    // Route registration must still work without options
    expect(content).toContain('app.get<')
    expect(content).toContain('"/pets/:id",')
  })

  it('no schemaNames option: no schema.response added', () => {
    const { content } = generateFastifyRouter(getPetSpec)
    expect(content).not.toContain('schema: { response:')
  })

  it('response schema import is added to the generated file', () => {
    const { content } = generateFastifyRouter(getPetSpec, {
      schemaNames: new Set(['PetSchema']),
      schemaImportPath: './schemas.js',
    })
    expect(content).toContain("import { PetSchema } from './schemas.js'")
  })

  it('response schema and body schema share a single import statement', () => {
    const postGetSpec = makeSpec({
      '/pets': {
        post: {
          operationId: 'createPet',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CreatePetRequest' } },
            },
          },
          responses: {
            '201': {
              description: 'created',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
            },
          },
        },
      },
    })
    const { content } = generateFastifyRouter(postGetSpec, {
      schemaNames: new Set(['CreatePetRequestSchema', 'PetSchema']),
      schemaImportPath: './schemas.js',
    })
    // Both must appear in a single import line
    const importMatch = content.match(/^import \{ ([^}]+) \} from '\.\/schemas\.js'/m)
    expect(importMatch).not.toBeNull()
    expect(importMatch![1]).toContain('CreatePetRequestSchema')
    expect(importMatch![1]).toContain('PetSchema')
  })

  it('setSerializerCompiler is added when response schemas are used', () => {
    const { content } = generateFastifyRouter(getPetSpec, {
      schemaNames: new Set(['PetSchema']),
      schemaImportPath: './schemas.js',
    })
    expect(content).toContain('app.setSerializerCompiler(')
    expect(content).toContain('zodSchema.parse(data)')
  })

  it('setSerializerCompiler is NOT added when no response schemas are matched', () => {
    const { content } = generateFastifyRouter(getPetSpec, {
      schemaNames: new Set(['SomeOtherSchema']),
      schemaImportPath: './schemas.js',
    })
    expect(content).not.toContain('app.setSerializerCompiler(')
  })

  it('setSerializerCompiler is NOT added when schemaNames is not provided', () => {
    const { content } = generateFastifyRouter(getPetSpec)
    expect(content).not.toContain('app.setSerializerCompiler(')
  })

  it('void (DELETE 204) operation: no schema.response added', () => {
    const deleteSpec = makeSpec({
      '/pets/{id}': {
        delete: {
          operationId: 'deletePet',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '204': { description: 'deleted' } },
        },
      },
    })
    const { content } = generateFastifyRouter(deleteSpec, {
      schemaNames: new Set(['PetSchema']),
      schemaImportPath: './schemas.js',
    })
    expect(content).not.toContain('schema: { response:')
  })

  it('multi-status operation (200+202): no schema.response added', () => {
    const multiStatusSpec = makeSpec({
      '/tasks/{id}': {
        get: {
          operationId: 'getTask',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'done',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Task' } } },
            },
            '202': {
              description: 'still running',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Task' } } },
            },
          },
        },
      },
    })
    const { content } = generateFastifyRouter(multiStatusSpec, {
      schemaNames: new Set(['TaskSchema']),
      schemaImportPath: './schemas.js',
    })
    expect(content).not.toContain('schema: { response:')
  })

  it('201 response: schema.response uses status code 201', () => {
    const postSpec = makeSpec({
      '/pets': {
        post: {
          operationId: 'createPet',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CreatePetRequest' } },
            },
          },
          responses: {
            '201': {
              description: 'created',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
            },
          },
        },
      },
    })
    const { content } = generateFastifyRouter(postSpec, {
      schemaNames: new Set(['CreatePetRequestSchema', 'PetSchema']),
      schemaImportPath: './schemas.js',
    })
    expect(content).toContain('schema: { response: { 201: PetSchema } }')
  })

  it('response schema without body schema: no z import needed for direct $ref', () => {
    // Direct $ref response uses PetSchema directly, no z.array() needed — no z import
    const { content } = generateFastifyRouter(getPetSpec, {
      schemaNames: new Set(['PetSchema']),
      schemaImportPath: './schemas.js',
    })
    // z is NOT needed for direct $ref responses (only for array responses or param validation)
    // This test verifies we don't import z unnecessarily for the simple case
    expect(content).not.toMatch(/^import \{ z \} from 'zod'/m)
  })

  it('Hono and Express generators are unaffected by response schema options', () => {
    const honoContent = generateRouter(getPetSpec, {
      schemaNames: new Set(['PetSchema']),
      schemaImportPath: './schemas.js',
    }).content
    expect(honoContent).not.toContain('schema: { response:')
    expect(honoContent).not.toContain('setSerializerCompiler')

    const expressContent = generateExpressRouter(getPetSpec, {
      schemaNames: new Set(['PetSchema']),
      schemaImportPath: './schemas.js',
    }).content
    expect(expressContent).not.toContain('schema: { response:')
    expect(expressContent).not.toContain('setSerializerCompiler')
  })
})
