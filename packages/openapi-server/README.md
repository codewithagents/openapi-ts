# @codewithagents/openapi-server

[![npm](https://img.shields.io/npm/v/@codewithagents/openapi-server.svg)](https://npmjs.com/package/@codewithagents/openapi-server)
[![CI](https://github.com/codewithagents/openapi-zod-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/codewithagents/openapi-zod-ts/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/codewithagents/openapi-zod-ts/graph/badge.svg?flag=openapi-server)](https://codecov.io/gh/codewithagents/openapi-zod-ts)
[![CodeQL](https://github.com/codewithagents/openapi-zod-ts/actions/workflows/codeql.yml/badge.svg)](https://github.com/codewithagents/openapi-zod-ts/actions/workflows/codeql.yml)

📖 **[Full documentation](https://openapi.codewithagents.de/openapi-server)**

Generate a typed service interface from your OpenAPI 3.x spec. Framework-agnostic by design: wire it to Hono, Express, Fastify, or any router you already use.

- **Framework-agnostic service interface**: `service.ts` is a plain TypeScript interface with no framework imports. Implement it however you want: Hono, Express, Fastify, Koa, plain `http`, Bun, Deno, or anything else.
- **Optional router scaffolding**: set `"framework"` to `"hono"`, `"express"`, or `"fastify"` and get a ready-to-mount router as a starting point. Set `"framework": "none"` (the default) and wire the interface yourself. The generated code only ever imports what you already have.
- **Type-safe contract**: the compiler tells you if your implementation drifts from the spec. Add an endpoint in the spec and forget to implement it. TypeScript fails the build.
- **Prettier-clean output**: every generated file passes `prettier --check` out of the box.
- **OpenAPI 3.x**: 3.1.x primary target, 3.0.x best-effort. Full support for `$ref`, `allOf`, `anyOf`, `oneOf`, `nullable`.
- **TypeScript strict mode**: all output passes `strict: true`.

---

## Install

```bash
pnpm add -D @codewithagents/openapi-server
# or
npm install -D @codewithagents/openapi-server
```

Requires [`openapi-zod-ts`](../openapi-zod-ts). Run both generators together.

---

## Quick start

**1. Create `openapi-server.config.json` in your project root:**

```json
{
  "input_openapi": "./spec/api.json",
  "output": "./generated",
  "framework": "hono"   // or "express", "fastify", "none" (none = service.ts only, default)
}
```

**2. Run the generator:**

```bash
npx openapi-server
```

**3. Files appear in `./generated/`:**

| File | What it contains |
|---|---|
| `service.ts` | TypeScript interface, one method per API operation |
| `router.ts` | `createRouter(service)` factory, mounts every route on a Hono app |

Run `openapi-zod-ts` first (or together) so `models.ts` exists before `service.ts` imports from it:

```bash
npx openapi-zod-ts && npx openapi-server
```

Or add to `package.json`:

```json
{
  "scripts": {
    "generate": "openapi-zod-ts && openapi-server"
  }
}
```

---

## Generated output

Given the petstore spec (`GET /pets`, `POST /pets`, `GET /pets/{id}`, `DELETE /pets/{id}`):

**`generated/service.ts`**

```ts
// This file is auto-generated. Do not edit manually.

import type { CreatePetRequest, Pet } from './models.js'

export interface PetstoreService {
  /** GET /pets */
  listPets(params?: { species?: string }): Promise<Pet[]>
  /** POST /pets */
  createPet(body: CreatePetRequest): Promise<Pet>
  /** GET /pets/{id} */
  getPet(id: string): Promise<Pet>
  /** DELETE /pets/{id} */
  deletePet(id: string): Promise<void>
}
```

**`generated/router.ts`**

```ts
// This file is auto-generated. Do not edit manually.

import { Hono } from 'hono'
import type { CreatePetRequest } from './models.js'
import type { PetstoreService } from './service.js'

export function createRouter(service: PetstoreService): Hono {
  const app = new Hono()

  app.get('/pets', async (c) => {
    const params = {
      species: c.req.query('species') ?? undefined
    }
    return c.json(await service.listPets(params))
  })

  app.post('/pets', async (c) => {
    const body = await c.req.json<CreatePetRequest>()
    return c.json(await service.createPet(body), 201)
  })

  app.get('/pets/:id', async (c) => {
    return c.json(await service.getPet(c.req.param('id')))
  })

  app.delete('/pets/:id', async (c) => {
    await service.deletePet(c.req.param('id'))
    return new Response(null, { status: 204 })
  })

  return app
}
```

The router handles:
- Path params: `{id}` → `:id` (Hono style), extracted via `c.req.param()`
- Query params: extracted and typed (`string`, `number`, `boolean`)
- Request bodies: parsed via `c.req.json<T>()` with the correct model type
- Response status: `200` for GET, `201` for POST, `204` for DELETE, derived from your spec

---

## Implementing the service

Create a file that satisfies the generated interface. The compiler enforces the contract:

```ts
// src/server/petService.ts
import { randomUUID } from 'node:crypto'
import type { PetstoreService } from '../generated/service.js'
import type { Pet } from '../generated/models.js'

const pets = new Map<string, Pet>()

export const petService: PetstoreService = {
  async listPets(params) {
    const all = Array.from(pets.values())
    if (params?.species) {
      return all.filter(p => p.species.toLowerCase() === params.species!.toLowerCase())
    }
    return all
  },
  async createPet(body) {
    const pet: Pet = { id: randomUUID(), ...body }
    pets.set(pet.id, pet)
    return pet
  },
  async getPet(id) {
    const pet = pets.get(id)
    if (!pet) throw new Error(`Pet ${id} not found`)
    return pet
  },
  async deletePet(id) {
    pets.delete(id)
  },
}
```

The interface is re-generated every time the spec changes. If you add an endpoint in the spec and forget to implement it, TypeScript will tell you at compile time.

---

## Wiring it up

Mount the generated router on a Hono app and serve it:

```ts
// src/server/index.ts
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { createRouter } from '../generated/router.js'
import { petService } from './petService.js'

const app = new Hono()

// Mount API routes at /api
const apiRouter = createRouter(petService)
app.route('/api', apiRouter)

serve({ fetch: app.fetch, port: 3001 })
```

`createRouter` returns a plain `Hono` instance. You can mount it at any path prefix, add middleware before or after, or nest it inside a larger app.

---

## Config reference

See the [full configuration reference](https://openapi.codewithagents.de/openapi-server#configuration) in the docs for a detailed options table and the `--config` CLI flag.

`openapi-server.config.json`:

```json
{
  "input_openapi": "./spec/api.json",       // required: path to OpenAPI 3.x spec (JSON or YAML)
  "output": "./generated",                  // required: directory to write generated files
  "framework": "hono",                      // optional: router target (default: "none")
  "input_schema": "./generated/schemas.ts", // optional: Zod schema file for request validation
  "context_type": "RequestContext"          // optional: TypeScript type for per-request caller context
}
```

| Field | Required | Default | Description |
|---|---|---|---|
| `input_openapi` | Yes | n/a | Path to OpenAPI 3.x spec |
| `output` | Yes | n/a | Directory to write `service.ts` and `router.ts` |
| `framework` | No | `"none"` | Router framework to generate: `"hono"`, `"express"`, `"fastify"`, or `"none"`. Use `"none"` to generate only `service.ts` |
| `input_schema` | No | none | Path to user-owned Zod schema file. Enables server-side request validation (see below) |
| `context_type` | No | none | TypeScript type name to thread through service methods as a final `ctx` argument. See below. |

Use `--config <path>` to point at a config file in a different location:

```bash
npx openapi-server --config ./config/openapi-server.config.json
```

Relative paths in the config resolve from the config file's directory.

---

## Zod request validation (`input_schema`)

See the [Zod validation](https://openapi.codewithagents.de/openapi-server#zod-validation-input_schema) section in the docs for the two-pass generation flow and schema naming convention.

Point `input_schema` at the same `schemas.ts` you use with `openapi-zod-ts`. The server generator adds runtime validation to every route that receives a request body:

**Config:**

```json
{
  "input_openapi": "./spec/api.json",
  "output": "./generated",
  "framework": "hono",
  "input_schema": "./generated/schemas.ts"
}
```

**Generated router with validation:**

```ts
app.post('/pets', async (c) => {
  const body = await c.req.json()
  const parseResult = CreatePetRequestSchema.safeParse(body)
  if (!parseResult.success) {
    return c.json({ error: 'Invalid request body', issues: parseResult.error.issues }, 422)
  }
  return c.json(await service.createPet(parseResult.data), 201)
})
```

Invalid requests get a structured `422` response instead of reaching your service implementation:

```json
{
  "error": "Invalid request body",
  "issues": [
    { "code": "too_small", "path": ["name"], "message": "Name is required" }
  ]
}
```

**Fastify validation is native.** The `"fastify"` router does not hand-roll the `safeParse` block shown above. It registers [`fastify-type-provider-zod`](https://github.com/turkerdev/fastify-type-provider-zod) once and attaches each operation's Zod schemas to the route (`schema: { body, querystring, params, headers, response }`), so Fastify validates and types requests through its own pipeline. Consequences specific to Fastify:

- **Validation failures return Fastify's native `400` (`FST_ERR_VALIDATION`)**, not the `422 { error, issues }` envelope that Hono and Express emit. Reshape it with a Fastify `setErrorHandler` if you want a different contract.
- **Responses are validated** against the declared response schema via the serializer compiler.
- **Handlers are fully typed**: `req.body`, `req.query`, and `req.params` are inferred from the Zod schemas (no manual generics or casts in your code).
- Requires `fastify` and `fastify-type-provider-zod` in your own `dependencies`.
- The router registers one `setErrorHandler` that maps the exported `HttpError` to its status; other errors are re-thrown to your app-level handler.
- Cookie params (`in: cookie`) are the exception: Fastify has no native cookie schema, so those keep a `_ckv` safeParse block and still return `422 { error: 'Invalid request cookies', issues }` (see [Cookie parameter validation](#cookie-parameter-validation)).

**Same schemas, both sides of the wire**: `openapi-zod-ts` validates outgoing requests in the browser; `openapi-server` validates incoming requests on the server. One `schemas.ts`, one source of truth.

**Drift detection**: if schemas diverge from the spec (extra schema, missing schema), the generator warns to stderr. Builds still succeed; the warning is advisory.

---

## Framework support

`service.ts` has no framework imports at all. It is always generated, always framework-agnostic, and works with anything.

`router.ts` is optional and supports:

| Value | What you get |
|---|---|
| `"none"` | Only `service.ts`. Wire the interface yourself. |
| `"hono"` | `service.ts` + a ready-to-mount `router.ts` using [Hono](https://hono.dev). Includes optional Zod request validation via `input_schema`. |
| `"express"` | `service.ts` + a ready-to-mount `router.ts` using [Express](https://expressjs.com) `Router`. Apply `express.json()` middleware before mounting. |
| `"fastify"` | `service.ts` + a `router.ts` that returns a `FastifyPluginAsyncZod` factory via `createRouter(service)`. Mount with `app.register(createRouter(service), { prefix })`. Uses [`fastify-type-provider-zod`](https://github.com/turkerdev/fastify-type-provider-zod) for native request/response validation. Requires `fastify` and `fastify-type-provider-zod` in your `dependencies`. |

The framework package must be in your own `dependencies`. This package adds nothing at runtime.

**Mounting patterns:**

```ts
// Hono
app.route('/api', createRouter(service))

// Express
app.use(express.json())
app.use('/api', createRouter(service))

// Fastify: createRouter(service) returns a FastifyPluginAsyncZod; mount it with register
fastify.register(createRouter(service), { prefix: '/api' })
```

The `"none"` path is always available and keeps the zero-footprint promise: the generated code has no runtime dependencies that you did not already choose.

## Cookie parameter validation

Operations that declare `in: cookie` parameters get the same Zod validation treatment as header and query params. The generator reads the cookie name and schema constraints (required, enum, minLength, maxLength, pattern) from the spec and emits a `_ckv` safeParse block in the generated route handler. Failures return `422 { error: 'Invalid request cookies', issues }`.

Cookie names are case-sensitive (unlike HTTP headers, which are always lowercased before lookup). The exact name from the spec is used for both the Zod field key and the value lookup.

Cookies are not forwarded to the service method signature. They are validated in the router layer only. Forwarding cookies to service methods is out of scope for the current release.

**Per-framework plugin requirements:**

| Framework | Required plugin / middleware | Cookie accessor |
|---|---|---|
| Fastify | `@fastify/cookie` registered before the router | `req.cookies['name']` |
| Express | `cookie-parser` middleware applied before mounting the router | `req.cookies['name']` |
| Hono | `hono/cookie` (imported automatically in the generated output) | `getCookie(c, 'name')` |

**Fastify setup:**

```ts
import fastifyCookie from '@fastify/cookie'

fastify.register(fastifyCookie)
fastify.register(createRouter(service), { prefix: '/api' })
```

**Express setup:**

```ts
import cookieParser from 'cookie-parser'

app.use(cookieParser())
app.use('/api', createRouter(service))
```

**Hono setup:**

No extra setup needed. The generator automatically adds `import { getCookie } from 'hono/cookie'` to the generated router when the spec declares cookie params. `hono/cookie` ships with Hono; no additional install is required.

---

## Error handling and troubleshooting

The generated router maps service-call errors in two cases. Hono and Express use a per-route `try/catch`; Fastify registers a single `setErrorHandler` once (no per-route `try/catch`). Both handle the same two cases:

- **`HttpError`** (exported from the generated `router.ts`): mapped to its `.status` code. Use `new HttpError(404, 'Pet not found')` inside service methods to return structured HTTP error responses.
- **All other errors**: re-thrown to your app-level error handler (`setErrorHandler` in Fastify, error-handling middleware in Express, `app.onError` in Hono).

This means custom error types that do NOT extend `HttpError` propagate to the framework layer, where you install a single error handler for logging, monitoring, and response shaping.

**Example: custom error reaching Fastify's `setErrorHandler`**

```ts
// Your custom error class — does NOT extend HttpError
class NotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} not found`)
    this.name = 'NotFoundError'
  }
}

// Service implementation throws NotFoundError
export const petService: PetstoreService = {
  async getPet(id) {
    const pet = db.get(id)
    if (!pet) throw new NotFoundError(`Pet ${id}`)
    return pet
  },
  // ...
}

// Register a Fastify error handler ONCE at the app level.
// The generated router re-throws non-HttpError errors, so they arrive here.
fastify.setErrorHandler((err, request, reply) => {
  if (err.name === 'NotFoundError') {
    return reply.status(404).send({ error: err.message })
  }
  // Unknown errors become 500
  fastify.log.error(err)
  return reply.status(500).send({ error: 'Internal server error' })
})

fastify.register(createRouter(petService), { prefix: '/api' })
```

The same pattern applies to Express error middleware (`app.use((err, req, res, next) => { ... })`) and to Hono's `app.onError((err, c) => { ... })`.

See [Error handling](https://openapi.codewithagents.de/openapi-server#error-handling) in the docs for per-framework error handler examples and [Troubleshooting](https://openapi.codewithagents.de/openapi-server#troubleshooting) for common issues such as missing Zod validation or `Cannot find module './models.js'`.

---

## Request-scoped context / caller principal (`context_type`)

The `context_type` config option threads a typed caller context through every generated service method. Use it to pass an authentication principal, a tenant ID, or any per-request metadata without coupling service code to framework types.

**Config:**

```json
{
  "input_openapi": "./spec/api.json",
  "output": "./generated",
  "framework": "hono",
  "context_type": "RequestContext"
}
```

**What changes in generated `service.ts`:**

```ts
// Without context_type (default):
export interface PetstoreService {
  listPets(params?: { species?: string }): Promise<Pet[]>
  getPet(id: string): Promise<Pet>
}

// With context_type: "RequestContext":
export interface PetstoreService<Ctx = never> {
  listPets(params?: { species?: string }, ctx: Ctx): Promise<Pet[]>
  getPet(id: string, ctx: Ctx): Promise<Pet>
}
```

The generic default `Ctx = never` keeps the interface usable when no context is needed: existing implementations that do not pass ctx continue to compile as long as the service is instantiated without a type argument.

**What changes in generated `router.ts`:**

The generated router passes the framework's native request/context object as the final argument to every service call:

| Framework | ctx value passed |
|---|---|
| Hono | `c` (the Hono `Context` object) |
| Express | `req` (the Express `Request` object) |
| Fastify | `req` (the Fastify `FastifyRequest` object) |

```ts
// Generated Hono handler (with context_type: "RequestContext"):
app.get('/pets', async (c) => {
  try {
    return c.json(await service.listPets(c))
  } catch (err) { ... }
})
```

**Implementing the service with context:**

```ts
import type { PetstoreService } from '../generated/service.js'
import type { Context } from 'hono'

// Define your request context type
interface RequestContext {
  userId: string
  tenantId: string
}

// Extract context from the Hono Context object in a middleware
const app = new Hono()
app.use('*', async (c, next) => {
  const userId = c.req.header('x-user-id') ?? ''
  // Store on the Hono context so the generated router can pass it
  c.set('userId', userId)
  await next()
})

// Implement the service — ctx is whatever the router passed (here: the Hono Context)
export const petService: PetstoreService<Context> = {
  async listPets(params, ctx) {
    const userId = ctx.get('userId')
    return db.listPets({ userId, ...params })
  },
  async getPet(id, ctx) {
    const userId = ctx.get('userId')
    return db.getPet(id, userId)
  },
}
```

**Backward compatibility:** if `context_type` is not set in the config, the generated output is identical to previous versions. No changes to the interface shape, no extra arguments in service calls.

---

## Non-JSON request bodies (Fastify)

Fastify 5 natively parses only `application/json` and `text/plain` request bodies. For other content types you must register the appropriate plugin before the generated router.

### application/x-www-form-urlencoded

Install and register [`@fastify/formbody`](https://github.com/fastify/fastify-formbody):

```bash
pnpm add @fastify/formbody
```

```ts
import fastifyFormbody from '@fastify/formbody'

fastify.register(fastifyFormbody)
fastify.register(createRouter(service), { prefix: '/api' })
```

Without this plugin, `req.body` is `undefined` for form-urlencoded requests and the handler receives no body.

### multipart/form-data

Install and register [`@fastify/multipart`](https://github.com/fastify/fastify-multipart) with `attachFieldsToBody: true`:

```bash
pnpm add @fastify/multipart
```

```ts
import fastifyMultipart from '@fastify/multipart'

fastify.register(fastifyMultipart, { attachFieldsToBody: true })
fastify.register(createRouter(service), { prefix: '/api' })
```

The `attachFieldsToBody` option is required. Without it, `@fastify/multipart` v10 exposes uploaded files only via async iterators (`request.parts()`), not via `req.body`. The generated router reads `req.body` and passes it to the service method, so `attachFieldsToBody: true` must be set.

### application/octet-stream

No extra plugin is needed. When your spec declares an `application/octet-stream` request body, the generator automatically emits an `addContentTypeParser` call inside `createRouter`:

```ts
app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (req, body, done) => done(null, body))
```

`addContentTypeParser` is a core Fastify API with no additional dependencies. The parsed body is a `Buffer` and is forwarded directly to the service method.

### 415 error-shape divergence

When a request arrives with an unsupported content type and no parser is registered, the two frameworks return different shapes:

| Framework | Status | Body shape |
|---|---|---|
| Hono | 415 | `{ error: 'Unsupported Media Type' }` |
| Fastify | 415 | `{ statusCode: 415, code: 'FST_ERR_CTP_INVALID_MEDIA_TYPE', error: 'Unsupported Media Type', message: '...' }` |

Hono uses the shared `{ error }` envelope from the generated router. Fastify uses its own framework-level 415 envelope, which is emitted before the route handler runs. If you rely on a consistent error shape across frameworks, register the appropriate parser or add a Fastify `setErrorHandler` that normalises the response.
