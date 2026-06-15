# petstore

Full-stack demo and e2e test harness for the `@codewithagents` OpenAPI toolchain. Uses all three generators together with a shared user-owned Zod schema.

## Purpose

- **Demo**: shows a real production-shaped project built on top of the generated code
- **E2E validation**: Playwright tests cover the full round-trip: browser form to Hono server to Zod validation to 422/201 response to React UI update.

Not published to npm (`private: true`). No unit tests; integration-level testing lives in `packages/integration/`.

## Generators used

| Config | Generates |
|---|---|
| `openapi-zod-ts.config.json` | `models.ts`, `client.ts`, `client-config.ts`, `index.ts` |
| `openapi-server.config.json` | `service.ts`, `router.ts` (Hono + Zod validation) |
| `openapi-react-query.config.json` | `hooks.ts`, `test-utils.ts` |

All three share `spec/api.json`. The `input_schema` for `openapi-zod-ts` and `openapi-server` points at `src/schemas.ts`.

## `src/schemas.ts` — user-owned

Written by hand with real business rules (`.min(1, 'Name is required')`). Generators never overwrite it. The `generated/` directory is gitignored and regenerated on demand.

## Dev / generate / test

```bash
pnpm run generate     # re-run all three generators (does NOT touch src/schemas.ts)
pnpm run dev          # generate + Vite + Hono server in watch mode (concurrently)
pnpm run test:e2e     # generate + vite build + playwright test (Chromium)
```

## CI

The `e2e` job in `.github/workflows/ci.yml` runs `test:e2e` in parallel with `Build, Lint & Test`. Requires `npx playwright install --with-deps chromium` before running.
