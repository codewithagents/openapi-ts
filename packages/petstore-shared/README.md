# @codewithagents/petstore-shared: the shared pet contract

Private package (`private: true`, never published). The single source of truth for the petstore example apps: one pet OpenAPI 3.1 spec plus the hand-written Zod schemas that go with it. [`petstore-fastify`](../petstore-fastify), [`petstore-express`](../petstore-express), and `petstore-hono` all reuse this package through relative config paths instead of duplicating the spec.

Per the testing strategy (see [`TESTING.md`](../../TESTING.md)), the canonical full-stack reference owns no spec; the contract was relocated here so every petstore app generates from the same input. This package commits its contents (the spec and schemas are the committed source of truth) and holds no generated output, since it is what the generators read from.

---

## What lives here

| File | Role |
|---|---|
| `spec/api.json` | The pet OpenAPI 3.1 spec: pets CRUD plus lab routes that exercise validation edge cases (query coercion, headers, non-JSON content types). |
| `schemas.ts` | Hand-written Zod schemas with real business rules (`.min(1, 'Name is required')`, bounded numbers, sized strings). Owned by humans, never generated. |

---

## How the apps consume it

Each example app points its generator configs at this package via relative paths, for example:

```json
{ "input_openapi": "../petstore-shared/spec/api.json", "input_schema": "../petstore-shared/schemas.ts" }
```

The generators read the spec, and `openapi-zod-ts` / `openapi-server` read `schemas.ts`, so the generated client and router validate against the same hand-written rules in every app. Of the four generators (`openapi-zod-ts`, `@codewithagents/openapi-server`, `@codewithagents/openapi-react-query`, `@codewithagents/openapi-msw`), this shared pet spec is consumed by `openapi-zod-ts` and `openapi-server` in the petstore apps.

---

## Lint

```bash
pnpm run lint     # tsc --noEmit, standalone typecheck of schemas.ts
```

`schemas.ts` is checked on its own so a broken refinement is caught here, before any consuming app regenerates against it. Unlike the example apps (which gitignore and regenerate their output), this package commits its contents.
