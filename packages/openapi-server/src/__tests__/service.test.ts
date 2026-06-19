import { describe, expect, it, vi } from 'vitest'
import type { OpenAPIV3_1 } from 'openapi-types'
import { generateService } from '../plugins/service.js'

// ── Fixture helpers ────────────────────────────────────────────────────────────

function makeSpec(paths: OpenAPIV3_1.PathsObject, title = 'Test API'): OpenAPIV3_1.Document {
  return {
    openapi: '3.1.0',
    info: { title, version: '1.0.0' },
    paths,
  }
}

function makeGetOp(opts: {
  operationId?: string
  pathParams?: string[]
  queryParams?: { name: string; required: boolean; type?: string }[]
  responseRef?: string
  responseArray?: boolean
}): OpenAPIV3_1.OperationObject {
  const parameters: OpenAPIV3_1.ParameterObject[] = []

  for (const p of opts.pathParams ?? []) {
    parameters.push({ name: p, in: 'path', required: true, schema: { type: 'string' } })
  }

  for (const q of opts.queryParams ?? []) {
    parameters.push({
      name: q.name,
      in: 'query',
      required: q.required,
      schema: { type: (q.type ?? 'string') as 'string' | 'integer' },
    })
  }

  let responseSchema: OpenAPIV3_1.SchemaObject | OpenAPIV3_1.ReferenceObject | undefined
  if (opts.responseRef !== undefined) {
    if (opts.responseArray) {
      responseSchema = {
        type: 'array',
        items: { $ref: `#/components/schemas/${opts.responseRef}` },
      }
    } else {
      responseSchema = { $ref: `#/components/schemas/${opts.responseRef}` }
    }
  }

  return {
    operationId: opts.operationId,
    parameters,
    responses:
      responseSchema !== undefined
        ? {
            '200': {
              description: 'ok',
              content: { 'application/json': { schema: responseSchema } },
            },
          }
        : { '200': { description: 'ok' } },
  }
}

function makePostOp(opts: {
  operationId?: string
  bodyRef?: string
  responseRef?: string
  responseStatus?: '200' | '201'
}): OpenAPIV3_1.OperationObject {
  const requestBody: OpenAPIV3_1.RequestBodyObject | undefined =
    opts.bodyRef !== undefined
      ? {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: `#/components/schemas/${opts.bodyRef}` },
            },
          },
        }
      : undefined

  const status = opts.responseStatus ?? '201'
  const responseSchema: OpenAPIV3_1.SchemaObject | OpenAPIV3_1.ReferenceObject | undefined =
    opts.responseRef !== undefined
      ? { $ref: `#/components/schemas/${opts.responseRef}` }
      : undefined

  return {
    operationId: opts.operationId,
    requestBody,
    responses:
      responseSchema !== undefined
        ? {
            [status]: {
              description: 'created',
              content: { 'application/json': { schema: responseSchema } },
            },
          }
        : { [status]: { description: 'created' } },
  }
}

function makeDeleteOp(operationId?: string): OpenAPIV3_1.OperationObject {
  return {
    operationId,
    responses: { '204': { description: 'deleted' } },
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('generateService', () => {
  it('output always starts with auto-generated header comment', () => {
    const spec = makeSpec({ '/pets': { get: makeGetOp({ operationId: 'listPets' }) } })
    const { content } = generateService(spec)
    expect(content).toMatch(/^\/\/ This file is auto-generated/)
  })

  it('filename is always service.ts', () => {
    const spec = makeSpec({ '/pets': { get: makeGetOp({ operationId: 'listPets' }) } })
    const { filename } = generateService(spec)
    expect(filename).toBe('service.ts')
  })

  it('derives interface name from spec title', () => {
    const spec = makeSpec({}, 'Pet Store')
    const { content } = generateService(spec)
    expect(content).toContain('export interface PetStoreService {')
  })

  it('uses ApiService as fallback when title is empty', () => {
    const spec = makeSpec({}, '')
    const { content } = generateService(spec)
    expect(content).toContain('export interface ApiService {')
  })

  it('produces empty interface for spec with no operations', () => {
    const spec = makeSpec({})
    const { content } = generateService(spec)
    expect(content).toContain('export interface TestAPIService {')
    expect(content).toContain('}')
  })

  it('basic GET produces correct method signature', () => {
    const spec = makeSpec({ '/pets': { get: makeGetOp({ operationId: 'listPets' }) } })
    const { content } = generateService(spec)
    expect(content).toContain('listPets(): Promise<void>')
  })

  it('GET with typed response reference produces correct return type', () => {
    const spec = makeSpec({
      '/pets': {
        get: makeGetOp({ operationId: 'listPets', responseRef: 'Pet', responseArray: true }),
      },
    })
    const { content } = generateService(spec)
    expect(content).toContain('listPets(): Promise<Pet[]>')
  })

  it('GET with single object response produces Promise<TypeName>', () => {
    const spec = makeSpec({
      '/pets/{id}': {
        get: makeGetOp({ operationId: 'getPet', pathParams: ['id'], responseRef: 'Pet' }),
      },
    })
    const { content } = generateService(spec)
    expect(content).toContain('getPet(id: string): Promise<Pet>')
  })

  it('imports types from ./models.js when response type is named', () => {
    const spec = makeSpec({
      '/pets': {
        get: makeGetOp({ operationId: 'listPets', responseRef: 'Pet', responseArray: true }),
      },
    })
    const { content } = generateService(spec)
    expect(content).toContain("import type { Pet } from './models.js'")
  })

  it('no import statement when no named types used', () => {
    const spec = makeSpec({ '/pets': { get: makeGetOp({ operationId: 'listPets' }) } })
    const { content } = generateService(spec)
    expect(content).not.toContain('import type')
  })

  it('path params become positional string args', () => {
    const spec = makeSpec({
      '/pets/{id}': {
        get: makeGetOp({ operationId: 'getPet', pathParams: ['id'] }),
      },
    })
    const { content } = generateService(spec)
    expect(content).toContain('getPet(id: string)')
  })

  it('multiple path params in template order', () => {
    const spec = makeSpec({
      '/owners/{ownerId}/pets/{petId}': {
        get: makeGetOp({ operationId: 'getOwnerPet', pathParams: ['ownerId', 'petId'] }),
      },
    })
    const { content } = generateService(spec)
    expect(content).toContain('getOwnerPet(ownerId: string, petId: string)')
  })

  it('optional query params become params? object', () => {
    const spec = makeSpec({
      '/pets': {
        get: makeGetOp({
          operationId: 'listPets',
          queryParams: [
            { name: 'species', required: false },
            { name: 'limit', required: false },
          ],
        }),
      },
    })
    const { content } = generateService(spec)
    expect(content).toContain('params?: {')
    expect(content).toContain('species?: string')
    expect(content).toContain('limit?: string')
  })

  it('required query param makes params required', () => {
    const spec = makeSpec({
      '/pets': {
        get: makeGetOp({
          operationId: 'listPets',
          queryParams: [
            { name: 'species', required: true },
            { name: 'limit', required: false },
          ],
        }),
      },
    })
    const { content } = generateService(spec)
    // params should be required (no ?) because at least one query param is required
    expect(content).toContain('params: {')
    expect(content).toContain('species: string')
    expect(content).toContain('limit?: string')
  })

  it('POST with requestBody produces body param', () => {
    const spec = makeSpec({
      '/pets': {
        post: makePostOp({
          operationId: 'createPet',
          bodyRef: 'CreatePetRequest',
          responseRef: 'Pet',
        }),
      },
    })
    const { content } = generateService(spec)
    expect(content).toContain('createPet(body: CreatePetRequest): Promise<Pet>')
  })

  it('POST with body imports body type from models.js', () => {
    const spec = makeSpec({
      '/pets': {
        post: makePostOp({
          operationId: 'createPet',
          bodyRef: 'CreatePetRequest',
          responseRef: 'Pet',
        }),
      },
    })
    const { content } = generateService(spec)
    expect(content).toContain("import type { CreatePetRequest, Pet } from './models.js'")
  })

  it('DELETE with 204 response returns Promise<void>', () => {
    const spec = makeSpec({
      '/pets/{id}': {
        delete: makeDeleteOp('deletePet'),
      },
    })
    const { content } = generateService(spec)
    expect(content).toContain('deletePet(id: string): Promise<void>')
  })

  it('POST with only 202 declared infers return type from 202 content schema', () => {
    // Bug #9: getReturnInfo() must check non-200/201 2xx codes for response content.
    const spec = makeSpec({
      '/jobs': {
        post: {
          operationId: 'enqueueJob',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Job' } },
            },
          },
          responses: {
            '202': {
              description: 'accepted',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Job' } },
              },
            },
          },
        },
      },
    })
    const { content } = generateService(spec)
    expect(content).toContain('enqueueJob(body: Job): Promise<Job>')
  })

  it('Bug #10 — GET with 200+202 declared produces envelope return type Promise<{ status: number; body: T }>', () => {
    // Bug #10: when multiple 2xx are declared, the service method returns a discriminated
    // envelope so the handler can choose the status code at runtime.
    const spec = makeSpec({
      '/tasks/{id}': {
        get: {
          operationId: 'getTask',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'done',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Task' } },
              },
            },
            '202': {
              description: 'still running',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Task' } },
              },
            },
          },
        },
      },
    })
    const { content } = generateService(spec)
    // The return type must be an envelope, not a plain Task
    expect(content).toContain('getTask(id: string): Promise<{ status: number; body: Task }>')
    // Must NOT produce plain Promise<Task> (that would bypass status selection)
    expect(content).not.toContain('getTask(id: string): Promise<Task>')
  })

  it('multiple operations produce multiple methods', () => {
    const spec = makeSpec({
      '/pets': {
        get: makeGetOp({ operationId: 'listPets' }),
        post: makePostOp({ operationId: 'createPet', bodyRef: 'CreatePetRequest' }),
      },
      '/pets/{id}': {
        get: makeGetOp({ operationId: 'getPet', pathParams: ['id'] }),
        delete: makeDeleteOp('deletePet'),
      },
    })
    const { content } = generateService(spec)
    expect(content).toContain('listPets()')
    expect(content).toContain('createPet(')
    expect(content).toContain('getPet(id: string)')
    expect(content).toContain('deletePet(id: string)')
  })

  it('includes JSDoc comment with HTTP method and path', () => {
    const spec = makeSpec({ '/pets': { get: makeGetOp({ operationId: 'listPets' }) } })
    const { content } = generateService(spec)
    expect(content).toContain('/** GET /pets */')
  })

  it('falls back to derived name when no operationId', () => {
    const spec = makeSpec({ '/pets': { get: makeGetOp({}) } })
    const { content } = generateService(spec)
    expect(content).toContain('getPets(')
  })

  it('path param comes before body arg', () => {
    const spec = makeSpec({
      '/pets/{id}': {
        put: {
          operationId: 'updatePet',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UpdatePetRequest' } },
            },
          },
          responses: {
            '200': {
              description: 'ok',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
            },
          },
        },
      },
    })
    const { content } = generateService(spec)
    expect(content).toContain('updatePet(id: string, body: UpdatePetRequest)')
  })

  it('query param name with [] suffix is normalized to a valid TypeScript identifier', () => {
    const spec = makeSpec({
      '/events': {
        get: makeGetOp({
          operationId: 'listEvents',
          queryParams: [
            { name: 'project_ids[]', required: false },
            { name: 'event_types[]', required: false },
          ],
        }),
      },
    })
    const { content } = generateService(spec)
    // [] suffix must be stripped and separators camelCased
    expect(content).toContain('projectIds?:')
    expect(content).toContain('eventTypes?:')
    // Raw names with [] must not appear in generated TypeScript
    expect(content).not.toContain('project_ids[]')
    expect(content).not.toContain('event_types[]')
  })

  it('path param with hyphens like {job-id} is sanitized to a valid TS identifier', () => {
    const spec: OpenAPIV3_1.Document = {
      openapi: '3.1.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/jobs/{job-id}': {
          get: {
            operationId: 'getJob',
            parameters: [
              { name: 'job-id', in: 'path', required: true, schema: { type: 'string' } },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    }
    const { content } = generateService(spec)
    // The sanitized param name jobId must appear in the method signature
    expect(content).toContain('jobId: string')
    // Raw hyphenated name must not appear as a TS identifier
    expect(content).not.toContain('job-id: string')
  })

  it('mixed path segment "{maxLat}.{format}" (no operationId) does not break method name derivation', () => {
    const spec: OpenAPIV3_1.Document = {
      openapi: '3.1.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
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
      },
    }
    const { content } = generateService(spec)
    // The method name must be a valid identifier — no brace or dot chars in the method signature
    expect(content).not.toMatch(/  [a-zA-Z]*\}[^*]/)
    // A method must be generated
    expect(content).toContain('versionNumber: string')
    expect(content).toContain('maxLon: string')
  })

  it('deduplicates type imports and sorts alphabetically', () => {
    const spec = makeSpec({
      '/pets': {
        post: makePostOp({ operationId: 'createPet', bodyRef: 'Pet', responseRef: 'Pet' }),
      },
    })
    const { content } = generateService(spec)
    // Pet should appear only once in import
    const importMatch = content.match(/import type \{([^}]+)\}/)
    expect(importMatch).not.toBeNull()
    const importNames = importMatch![1]!.split(',').map((s) => s.trim())
    const petCount = importNames.filter((n) => n === 'Pet').length
    expect(petCount).toBe(1)
  })
})

describe('coverage: requestBody as $ref — body param is omitted from service method', () => {
  it('requestBody $ref produces a service method without a typed body param', () => {
    // Covers the `if (isRef(requestBody)) return { typeName: undefined }` branch in getBodyInfo
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
    const { content } = generateService(spec)
    expect(content).toContain('createItem(')
    // requestBody is a $ref (unresolvable) so body has no named model type — falls back to unknown
    expect(content).toContain('body: unknown')
  })
})

describe('coverage: 200/$ref response — getReturnInfo falls through to void', () => {
  it('$ref 200 response is skipped and return type falls back to Promise<void>', () => {
    // Covers the `if (isRef(response)) continue` branch in getReturnInfo
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
    const { content } = generateService(spec)
    expect(content).toContain('getItem(')
    expect(content).toContain('Promise<void>')
  })
})

describe('coverage: spec.info without title — service name falls back to ApiService', () => {
  it('spec with no title generates ApiService interface name', () => {
    // Covers the `spec.info?.title ?? ''` null-coalescing branch and `pascal.length === 0` fallback
    const spec: OpenAPIV3_1.Document = {
      openapi: '3.1.0',
      info: { version: '1.0.0' } as OpenAPIV3_1.InfoObject,
      paths: {},
    }
    const { content } = generateService(spec)
    expect(content).toContain('export interface ApiService')
  })
})

describe('coverage: sanitizeOperationId — all-punctuation operationId returns unknown', () => {
  it('operationId consisting entirely of non-alphanumeric characters → unknown method name', () => {
    // Covers `if (parts.length === 0) return 'unknown'` in sanitizeOperationId (service.ts line ~80)
    const spec = makeSpec({
      '/items': {
        get: {
          operationId: '---',
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const { content } = generateService(spec)
    expect(content).toContain('unknown(')
  })
})

describe('coverage: operationId starting with a digit — prefixed with underscore', () => {
  it('operationId that begins with a digit is prefixed with _ to be a valid JS identifier', () => {
    // Covers the `/^[0-9]/.test(camel) ? `_${camel}` : camel` true branch in sanitizeOperationId
    const spec = makeSpec({
      '/items': {
        get: {
          operationId: '123getItems',
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const { content } = generateService(spec)
    expect(content).toContain('_123getItems(')
  })
})

describe('coverage: requestBody with no content property in service — body is omitted', () => {
  it('requestBody without content generates a method without a typed body param', () => {
    // Covers `if (content === undefined) return { typeName: undefined }` in getBodyInfo (service.ts)
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
    const { content } = generateService(spec)
    expect(content).toContain('createItem(')
    expect(content).toContain('body: unknown')
  })
})

describe('coverage: operation with no responses in service — returns Promise<void>', () => {
  it('operation without a responses property generates Promise<void> return type', () => {
    // Covers `if (responses === undefined) return { typeName: undefined, isArray: false, isVoid: true }` in getReturnInfo
    const spec = makeSpec({
      '/items': {
        get: {
          operationId: 'listItems',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any, // no responses property
      },
    })
    const { content } = generateService(spec)
    expect(content).toContain('listItems(')
    expect(content).toContain('Promise<void>')
  })
})

describe('coverage: spec with paths=undefined in service — generates empty interface', () => {
  it('spec without a paths property generates an empty service interface', () => {
    // Covers `if (paths === undefined) return []` in collectOperations (service.ts)
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Empty', version: '1.0.0' },
      // no paths property
    } as OpenAPIV3_1.Document
    const { content } = generateService(spec)
    expect(content).toContain('export interface EmptyService')
    // No method signatures since there are no operations
    expect(content).not.toContain('(')
  })
})

describe('coverage: resolveParamRef — component parameter that is itself a $ref', () => {
  it('parameter component that is a $ref is treated as unresolvable (no expansion)', () => {
    // Covers the `isRef(resolved)` branch in resolveParamRef — double-indirection ref
    const spec: OpenAPIV3_1.Document = {
      openapi: '3.1.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/items': {
          get: {
            operationId: 'listItems',
            parameters: [
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              { $ref: '#/components/parameters/FilterParam' } as any,
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
      components: {
        parameters: {
          // This parameter is itself a $ref — double indirection, treated as unresolvable
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          FilterParam: { $ref: '#/components/parameters/BaseFilter' } as any,
        },
      },
    }
    const { content } = generateService(spec)
    // The operation is still generated, just without the unresolvable query param
    expect(content).toContain('listItems(')
  })
})

// ── Bug #11 fix: non-JSON response types in service interface ─────────────────

describe('bug #11 fix: text/plain and octet-stream return types in service interface', () => {
  it('text/plain response maps to Promise<string> return type', () => {
    const spec = makeSpec({
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
    const { content } = generateService(spec)
    expect(content).toContain('labPlainText(): Promise<string>')
  })

  it('application/octet-stream response maps to Promise<Uint8Array> return type', () => {
    const spec = makeSpec({
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
    const { content } = generateService(spec)
    expect(content).toContain('labDownload(): Promise<Uint8Array>')
  })

  it('text/plain return type is NOT imported from models.ts', () => {
    const spec = makeSpec({
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
    const { content } = generateService(spec)
    // Primitive types must not appear as model imports
    expect(content).not.toContain("import type { string }")
    expect(content).not.toContain("import type {")
  })

  it('JSON response still maps to Promise<ModelType> and imports from models.ts', () => {
    const spec = makeSpec({
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
      },
    })
    const { content } = generateService(spec)
    expect(content).toContain('listPets(): Promise<Pet>')
    expect(content).toContain("import type { Pet } from './models.js'")
  })
})

// ── Synthesized body types: no dangling model imports ─────────────────────────

describe('service: synthesized body types use unknown — no dangling model imports', () => {
  it('inline JSON body: body param is unknown, synthesized name not imported from models', () => {
    const spec = makeSpec({
      '/lab/inline-body': {
        post: {
          operationId: 'labInlineBody',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', properties: { title: { type: 'string' } } },
              },
            },
          },
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const { content } = generateService(spec)
    // Synthesized name LabInlineBody must NOT appear as an import
    expect(content).not.toContain('LabInlineBody')
    // Body param must use unknown
    expect(content).toContain('body: unknown')
  })

  it('form-urlencoded inline body: body param is unknown, synthesized name not imported', () => {
    const spec = makeSpec({
      '/lab/form-body': {
        post: {
          operationId: 'labFormBody',
          requestBody: {
            required: true,
            content: {
              'application/x-www-form-urlencoded': {
                schema: {
                  type: 'object',
                  properties: { label: { type: 'string' }, quantity: { type: 'integer' } },
                },
              },
            },
          },
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const { content } = generateService(spec)
    expect(content).not.toContain('LabFormBody')
    expect(content).toContain('body: unknown')
  })

  it('multipart/form-data inline body: body param is unknown, synthesized name not imported', () => {
    const spec = makeSpec({
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
                    photos: { type: 'array', items: { type: 'string', format: 'binary' } },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'ok' } },
        },
      },
    })
    const { content } = generateService(spec)
    expect(content).not.toContain('LabGallery')
    expect(content).toContain('body: unknown')
    // No dangling import from models.ts
    expect(content).not.toContain("import type { LabGallery }")
  })

  it('$ref body: named type IS imported from models and used in param', () => {
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
          responses: { '200': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } },
        },
      },
    })
    const { content } = generateService(spec)
    expect(content).toContain('body: CreatePetRequest')
    expect(content).toContain('CreatePetRequest')
    // Named type is imported
    expect(content).toContain("import type {")
  })
})

// ── Context type (issue #310) ─────────────────────────────────────────────────

describe('generateService with contextType option', () => {
  it('without contextType: interface has no generic and no ctx arg (backward compat)', () => {
    const spec = makeSpec({
      '/pets': { get: makeGetOp({ operationId: 'listPets', responseRef: 'Pet', responseArray: true }) },
    })
    const { content } = generateService(spec)
    // No generic on the interface
    expect(content).not.toContain('<Ctx')
    // No ctx arg in method
    expect(content).not.toContain('ctx:')
  })

  it('with contextType: interface declaration includes <Ctx = never>', () => {
    const spec = makeSpec({
      '/pets': { get: makeGetOp({ operationId: 'listPets', responseRef: 'Pet', responseArray: true }) },
    })
    const { content } = generateService(spec, { contextType: 'RequestContext' })
    // makeSpec uses title 'Test API' which derives to TestAPIService
    expect(content).toContain('export interface TestAPIService<Ctx = never> {')
  })

  it('with contextType: each method receives a ctx: Ctx final arg', () => {
    const spec = makeSpec({
      '/pets': {
        get: makeGetOp({ operationId: 'listPets', responseRef: 'Pet', responseArray: true }),
        post: makePostOp({ operationId: 'createPet', bodyRef: 'CreatePetRequest', responseRef: 'Pet' }),
      },
    })
    const { content } = generateService(spec, { contextType: 'RequestContext' })
    expect(content).toContain('listPets(ctx: Ctx): Promise<Pet[]>')
    expect(content).toContain('createPet(body: CreatePetRequest, ctx: Ctx): Promise<Pet>')
  })

  it('with contextType: ctx is placed after path params, body and query params', () => {
    const spec = makeSpec({
      '/pets/{id}': {
        get: makeGetOp({
          operationId: 'getPet',
          pathParams: ['id'],
          queryParams: [{ name: 'format', required: false }],
          responseRef: 'Pet',
        }),
      },
    })
    const { content } = generateService(spec, { contextType: 'RequestContext' })
    // ctx must be after id, after params
    expect(content).toContain('getPet(id: string, params?: { format?: string }, ctx: Ctx)')
  })

  it('with contextType: ctx is present even on void-return operations', () => {
    const spec = makeSpec({
      '/pets/{id}': { delete: makeDeleteOp('deletePet') },
    })
    const { content } = generateService(spec, { contextType: 'UserCtx' })
    expect(content).toContain('deletePet(id: string, ctx: Ctx): Promise<void>')
  })
})

// ── Issue #312: warn on untyped service responses ─────────────────────────────

describe('issue #312: warn on untyped service responses', () => {
  it('warns when an operation has no response schema (falls back to Promise<unknown>)', () => {
    const spec = makeSpec({
      '/widgets': {
        get: {
          operationId: 'listWidgets',
          responses: {
            '200': {
              description: 'ok',
              content: {
                'application/json': {
                  // Inline schema, not a $ref: produces unknown return type
                  schema: { type: 'object', properties: { id: { type: 'string' } } },
                },
              },
            },
          },
        },
      },
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      generateService(spec)
      expect(warnSpy).toHaveBeenCalledOnce()
      const msg = warnSpy.mock.calls[0]![0] as string
      expect(msg).toContain('listWidgets')
      expect(msg).toContain('GET /widgets')
      expect(msg).toContain('response type is unknown')
      expect(msg).toContain('no response schema found in the spec')
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('warns for Promise<unknown[]> (inline array without $ref items)', () => {
    const spec = makeSpec({
      '/items': {
        get: {
          operationId: 'listItems',
          responses: {
            '200': {
              description: 'ok',
              content: {
                'application/json': {
                  // Array with inline items, not a $ref: produces unknown[] return
                  schema: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      generateService(spec)
      expect(warnSpy).toHaveBeenCalledOnce()
      const msg = warnSpy.mock.calls[0]![0] as string
      expect(msg).toContain('listItems')
      expect(msg).toContain('GET /items')
      expect(msg).toContain('response type is unknown')
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('does NOT warn when operation has a typed $ref response', () => {
    const spec = makeSpec({
      '/pets/{id}': {
        get: makeGetOp({ operationId: 'getPet', pathParams: ['id'], responseRef: 'Pet' }),
      },
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      generateService(spec)
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('does NOT warn for void operations (204, no content)', () => {
    const spec = makeSpec({
      '/pets/{id}': { delete: makeDeleteOp('deletePet') },
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      generateService(spec)
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('does NOT warn for text/plain responses (typed as Promise<string>)', () => {
    const spec = makeSpec({
      '/text': {
        get: {
          operationId: 'getText',
          responses: {
            '200': {
              description: 'ok',
              content: { 'text/plain': { schema: { type: 'string' } } },
            },
          },
        },
      },
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      generateService(spec)
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('does NOT warn for octet-stream responses (typed as Promise<Uint8Array>)', () => {
    const spec = makeSpec({
      '/download': {
        get: {
          operationId: 'download',
          responses: {
            '200': {
              description: 'ok',
              content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
            },
          },
        },
      },
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      generateService(spec)
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('warns once per untyped operation, not for typed operations in the same spec', () => {
    const spec = makeSpec({
      '/pets': {
        get: makeGetOp({ operationId: 'listPets', responseRef: 'Pet', responseArray: true }),
      },
      '/widgets': {
        get: {
          operationId: 'listWidgets',
          responses: {
            '200': {
              description: 'ok',
              content: { 'application/json': { schema: { type: 'object' } } },
            },
          },
        },
      },
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      generateService(spec)
      // Only the untyped operation warns
      expect(warnSpy).toHaveBeenCalledOnce()
      const msg = warnSpy.mock.calls[0]![0] as string
      expect(msg).toContain('listWidgets')
      expect(msg).not.toContain('listPets')
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('warning message does not contain em dashes', () => {
    const spec = makeSpec({
      '/things': {
        get: {
          operationId: 'listThings',
          responses: {
            '200': { description: 'ok', content: { 'application/json': { schema: { type: 'object' } } } },
          },
        },
      },
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      generateService(spec)
      const msg = warnSpy.mock.calls[0]![0] as string
      expect(msg).not.toContain('—') // em dash character
    } finally {
      warnSpy.mockRestore()
    }
  })
})
