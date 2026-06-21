# petstore-fastify (private, unpublished)

THE canonical full-stack reference for the `@codewithagents` OpenAPI toolchain. Fastify is the framework the project ships its canonical app on. This is the place to look for "how does it all fit together end to end".

It wires three of the toolchain's four generators (`openapi-zod-ts`, `openapi-server`, `openapi-react-query`; the fourth, `openapi-msw`, is not used here) on top of the shared contract in `packages/petstore-shared`, plus a local auth lab spec, then proves the round-trip with a React frontend and browser e2e.

Not published to npm (`private: true`). Unit-level tests live in `src/__tests__/`; cross-package integration testing lives in `packages/integration/`.

## What it demonstrates

- **Fastify router** generated from the shared pet spec into `generated/`, mounted under `/api`.
- **createContext auth seam**: a local Auth Lab spec generates `generated-auth/` with a `context_type: AuthContext`. `buildAuthApp` issues a bearer token on login and reads it back in `createContext`; the seam supplies context but does not itself enforce auth.
- **Cross-field validation**: `src/auth-schemas.ts` carries a `superRefine` on the secured `/contact` form. The client parses before sending, and the server returns **400** (not 422) when the conditional rule fails.
- **React / react-query frontend**: the SPA logs in for a bearer token, then submits the secured `/contact` form. A cross-field error round-trips from the server back onto the correct form field.

## Generation configs

Two spec sources, five generator invocations in `pnpm generate`:

| Config | Spec | Output | Generates |
|---|---|---|---|
| `openapi-zod-ts.config.json` | `../petstore-shared/spec/api.json` | `generated/` | models, fetch client, Zod |
| `openapi-server.config.json` | `../petstore-shared/spec/api.json` | `generated/` | service + Fastify router |
| `openapi-zod-ts.auth.config.json` | `spec/auth-lab.json` | `generated-auth/` | models, client, Zod |
| `openapi-server.auth.config.json` | `spec/auth-lab.json` | `generated-auth/` | service + Fastify router (`AuthContext`) |
| `openapi-react-query.auth.config.json` | `spec/auth-lab.json` | `generated-auth/` | react-query hooks |

The base config consumes the **shared contract** (`petstore-shared` owns `spec/api.json` and the hand-written `schemas.ts`). The auth lab spec and `src/auth-schemas.ts` are local to this package.

`generated/` and `generated-auth/` are **gitignored and regenerated on demand** (`pnpm generate`, or any test/build script that runs it first). Nothing under those directories is committed.

## Servers

| Entry | Port | Purpose |
|---|---|---|
| `src/server/index.ts` | 3003 | Pet API only (generated Fastify router under `/api`) |
| `src/server/fullstackServer.ts` | 3004 | Auth lab API plus the built React SPA on one port |
| `src/server/authApp.ts` | n/a | `buildAuthApp` factory: login, secured `/me` and `/contact`, `createContext` |

## Dev / generate / test

```bash
pnpm install && pnpm build       # generate + vite build
pnpm run generate                # re-run the five generator invocations
pnpm run start                   # pet API on :3003
pnpm run dev                     # generate + vite + fullstack server (watch)
pnpm run test                    # generate + vitest unit tests
pnpm run test:e2e                # generate + playwright (pet routes + lab)
pnpm run test:e2e:auth           # build + playwright against the fullstack server on :3004
pnpm run typecheck               # generate + tsc --noEmit (typecheck:generated)
```

## CI

Jobs in `.github/workflows/ci.yml` cover this package: `typecheck:generated`, `server-examples`, `e2e-fastify`, and `e2e-fastify-fullstack`. petstore Playwright runs as these jobs, there is no top-level E2E workflow. The legacy `petstore-hono` package keeps its own Hono e2e job and is no longer the canonical full-stack demo.

## Gotchas

- The cross-field rule lives in `src/auth-schemas.ts` `superRefine`; the client parses before the request, so the server returns **400**, not 422.
- `createContext` supplies request context but does not itself enforce auth; route handlers decide.
- Generated output is gitignored. If imports from `generated/` or `generated-auth/` look missing, run `pnpm generate` first.
