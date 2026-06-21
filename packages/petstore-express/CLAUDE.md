# petstore-express (private, unpublished)

A thin Express backend smoke test for the `@codewithagents` toolchain. It proves the Express router target of `openapi-server` generates and runs, nothing more. For the full-stack story (auth, frontend, browser e2e) see `packages/petstore-fastify`, the canonical reference; `openapi-server` targets `hono | express | fastify | none` (default `none`).

Not published to npm (`private: true`).

## Scope

- **Inject / supertest smoke**: `src/__tests__/routes.test.ts` fires HTTP at the generated Express router via `supertest`.
- **Typecheck**: `tsc --noEmit` over the generated output and the small service.

No frontend, no auth, no Playwright. Just "does the Express target generate, typecheck, and respond".

## Generation configs

Two generators, both reading the **shared contract** in `packages/petstore-shared`:

| Config | Output | Generates |
|---|---|---|
| `openapi-zod-ts.config.json` | `generated/` | models, fetch client, Zod |
| `openapi-server.config.json` | `generated/` | service + Express router (`framework: express`) |

Both point at `../petstore-shared/spec/api.json`; the server config also reuses `../petstore-shared/schemas.ts`. `petstore-shared` owns the spec and hand-written Zod schemas.

`generated/` is **gitignored and regenerated on demand** (`pnpm generate`, or any script that runs it first). Nothing under it is committed.

## Dev / test

```bash
pnpm run generate     # re-run both generators
pnpm run start        # generate + Express server (tsx)
pnpm run test         # generate + vitest (supertest inject smoke)
pnpm run typecheck    # generate + tsc --noEmit -p tsconfig.typecheck.json
```

## CI

The typecheck and smoke run as `openapi-server` example jobs in `.github/workflows/ci.yml`, alongside the other server-example targets. No standalone E2E workflow exists.
