# @codewithagents/petstore-shared (private, unpublished)

The shared contract for the petstore example apps. Owns one pet OpenAPI spec plus the hand-written Zod schemas that go with it. `petstore-fastify`, `petstore-express`, and `petstore-hono` all reuse this package through relative config paths instead of duplicating the spec.

Not published to npm (`private: true`). No generated output here, this package is the source the generators read from.

## What lives here

| File | Role |
|---|---|
| `spec/api.json` | The pet OpenAPI 3.1 spec (pets CRUD plus the lab routes that exercise validation edge cases) |
| `schemas.ts` | Hand-written Zod schemas with real business rules (`.min(1, 'Name is required')`, bounded numbers, sized strings). Owned by humans, never generated. |

## How the apps consume it

Each example app points its generator configs at this package via relative paths, for example:

```json
{ "input_openapi": "../petstore-shared/spec/api.json", "input_schema": "../petstore-shared/schemas.ts" }
```

The four generators (`openapi-zod-ts`, `openapi-server`, `openapi-react-query`, `openapi-msw`) read the spec, and `openapi-zod-ts` / `openapi-server` read `schemas.ts` so the generated client and router validate against the same hand-written rules in every app.

## Lint

```bash
pnpm run lint     # tsc --noEmit, standalone typecheck of schemas.ts
```

`schemas.ts` is checked on its own so a broken refinement is caught here, before any consuming app regenerates against it. Unlike the example apps, this package commits its contents; the spec and schemas are the committed source of truth.
