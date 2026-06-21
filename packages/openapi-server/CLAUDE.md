# openapi-server

Generate a typed server-side service interface and an optional framework router from an OpenAPI 3.x spec (3.1 primary target, 3.0.x best-effort).

## Generates

| File | Description |
|---|---|
| `service.ts` | TypeScript interface, one method per operation; implement this to wire your business logic |
| `router.ts` | Framework router (`createRouter(service)`): routes with optional Zod validation. Only generated when `framework` is not `"none"`. Re-exports `HttpError` from `_shared/errors.ts`. |
| `_shared/errors.ts` | Shared `HttpError` class, emitted once per generation run. Single-project: inside the `output` dir. Multi-project: at the longest common parent of all `output` dirs. Override with `shared_output` in config. |

## Two-pass generation (schema-enhanced mode)

When `input_schema` is set in config:

1. **First pass** — generates `service.ts` + `router.ts` + `_shared/errors.ts` (no Zod validation in router)
2. **Second pass** — re-generates `router.ts` with `safeParse` calls using the schemas from `input_schema`; returns `422 { error, issues }` on validation failure

`input_schema` is **never overwritten** — the user owns it.
`_shared/errors.ts` is always emitted once per run regardless of schema mode.

## Config

Default: `openapi-server.config.json` in CWD. Fields: `input_openapi`, `output`, `framework?` (`"hono"` | `"express"` | `"fastify"` | `"none"`, default: `"none"`), `input_schema?`, `shared_output?` (override for `_shared/errors.ts` location).

## Fastify service interface shape

Every Fastify service method receives its request data through a single required `input` object. Only facets that the operation actually has are present as keys; no empty facets are emitted.

```typescript
// Example: path param + optional query + body + context_type
interface PetstoreService<Ctx = never> {
  createPet(input: { body: CreatePetRequest }): Promise<Pet>
  getPet(input: { params: { id: string } }): Promise<Pet>
  listPets(input: { query: { species?: string } }): Promise<Pet[]>
  getHealth(ctx: Ctx): Promise<void>                          // zero-facet: no input
  contact(input: { body: ContactRequest }, ctx: Ctx): Promise<ContactResponse>
}
```

Rules:
- Facet keys (`params`, `body`, `query`, `headers`, `cookies`) are present only when the operation has them.
- Each PRESENT facet key is REQUIRED on the outer `input` object (no `?`).
- Per-field optionality lives INSIDE each facet (e.g. `query: { q?: string }`).
- Zero facets: `input` is omitted entirely; the method signature is `(ctx: Ctx)` or `()`.
- `ctx` is always a SEPARATE trailing arg after `input`; it is never inside `input`.

This shape eliminates TS1016 (required parameter cannot follow an optional parameter) by construction: `input` is always required when present, so `ctx` can safely follow it.

## Fastify-specific runtime options

`createRouter(service, options?)` accepts a `CreateRouterOptions` object:

- `createContext?: (req: FastifyRequest) => Ctx | Promise<Ctx>`: **only emitted when `context_type` is set, and then it is required**. When `context_type` is set, `createRouter` is generic over `Ctx` (`createRouter<Ctx = never>`), `CreateRouterOptions` becomes generic (`CreateRouterOptions<Ctx>`), and the options parameter is no longer optional. The concrete type is inferred at the call site; no context type name is baked into generated output. The hook runs first inside every handler (the auth boundary: throw `HttpError(401)` to reject) and its result is passed as `ctx` to every service method, replacing the raw request. Operation-level `security` (`operation.security ?? spec.security`) is surfaced at `req.routeOptions.config.security` and as an escaped `@security` JSDoc tag on each service method; it is metadata only, `createContext` enforces it.
- `registerParsers?: boolean` — set `false` to skip auto-registering `@fastify/formbody` / `@fastify/multipart`
- `registerCustomRoutes?: (app: FastifyInstance) => void | Promise<void>` — callback called after ZodTypeProvider compilers, error handler, and body parsers are set up, but before spec-generated routes. Custom routes here inherit ZodTypeProvider and HttpError handling.
- `onRequest?: onRequestHookHandler | onRequestHookHandler[]`: plugin-scoped onRequest hooks; ideal for auth, rate-limiting, request ID injection. Fire before validation.
- `preHandler?: preHandlerHookHandler | preHandlerHookHandler[]`: plugin-scoped preHandler hooks; fire after validation, before the route handler. Ideal for authorization and context enrichment.
- `onSend?: onSendHookHandler | onSendHookHandler[]`: plugin-scoped onSend hooks; fire after the handler, before the response is flushed. Ideal for response header injection.
- `onError?: onErrorHookHandler | onErrorHookHandler[]`: plugin-scoped onError hooks; fire when any route handler or hook throws. For observability only: `errorHandler`/`setErrorHandler` is still the single response-producer. Both coexist safely.

Hook execution order per request: `onRequest` -> `preHandler` -> handler -> `onSend`. Hooks are plugin-scoped: they cover generated routes and `registerCustomRoutes` routes, but not the parent Fastify instance.

## Key non-obvious decisions

- **`--external:prettier` in esbuild** — Prettier is ESM-only; dynamic `await import('prettier')` + external flag keeps the CJS CLI bundle small (~700 KB) and avoids a `createRequire(undefined)` crash
- **`createRouter(service)`** — router is a factory, not a singleton; makes it trivially testable with `app.request()` in vitest without starting a server
- **Zod validation is opt-in** — no `input_schema` → router is plain Hono with no Zod dep in generated output; zero footprint for consumers who don't want validation
- **Schema names matched by convention** — `${PascalCasedOperationBodyType}Schema` must exist in `input_schema`; unmatched schemas trigger a `console.warn` drift warning

## Test / build

```
pnpm test    # vitest
pnpm build   # tsc + esbuild CJS CLI
```
