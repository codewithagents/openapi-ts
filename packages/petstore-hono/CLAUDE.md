# petstore-hono

> **Retained legacy.** This is the retained legacy Hono full-stack surface. It keeps Hono router coverage plus a React + react-query Playwright e2e round-trip, but it is NO LONGER the canonical reference. The canonical full-stack demo is `packages/petstore-fastify` (https://github.com/codewithagents/openapi-zod-ts/tree/main/packages/petstore-fastify). Point new readers there first.

Legacy Hono full-stack surface for the `@codewithagents` OpenAPI toolchain. Wires three of the four generators (openapi-zod-ts, openapi-server, openapi-react-query; no openapi-msw mocks here) against the shared pet contract.

## Purpose

- **Hono coverage**: exercises the Hono router target of `@codewithagents/openapi-server` in a real production-shaped project.
- **E2E validation**: Playwright tests cover the full round-trip: browser form to Hono server to Zod validation to 422/201 response to React UI update.

Not published to npm (`private: true`). No unit tests; integration-level testing lives in `packages/integration/`.

## Generators used

| Config | Generates |
|---|---|
| `openapi-zod-ts.config.json` | `models.ts`, `client.ts`, `client-config.ts`, `index.ts` |
| `openapi-server.config.json` | `service.ts`, `router.ts` (Hono + Zod validation) |
| `openapi-react-query.config.json` | `hooks.ts`, `test-utils.ts` |

The spec and the hand-written Zod schemas are not local to this package. The spec is `../petstore-shared/spec/api.json` and the hand-written schemas are `../petstore-shared/schemas.ts`, both owned by `@codewithagents/petstore-shared` and reused here via relative config paths (`input_openapi`, `input_schema`).

## Shared contract

`@codewithagents/petstore-shared` owns the pet OpenAPI spec plus the hand-written Zod schemas (real business rules like `.min(1, 'Name is required')`). Generators never overwrite those schemas. The `generated/` directory is gitignored and regenerated on demand, so it is rebuilt on every run rather than committed.

## Dev / generate / test

```bash
pnpm run generate     # re-run the three wired generators (does NOT touch petstore-shared schemas)
pnpm run dev          # generate, then Vite plus the Hono server in watch mode (concurrently)
pnpm run test:e2e     # generate, then vite build, then playwright test (Chromium)
```

## CI

In `.github/workflows/ci.yml` the petstore-hono e2e job (job id `e2e`, name `E2E (Petstore)`) runs `pnpm --filter @codewithagents/petstore-hono run test:e2e`. Generated code is not committed, so `test:e2e` runs `pnpm generate` first. It needs `npx playwright install --with-deps chromium` before running. Separate `e2e-fastify` and `e2e-fastify-fullstack` jobs cover the canonical Fastify app. petstore-hono is intentionally not yet wired into the `typecheck-generated` job.
