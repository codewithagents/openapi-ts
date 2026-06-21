# petstore-fastify: the canonical full-stack reference

Private package (`private: true`, never published). This is **the one** end-to-end reference app for the toolchain: a single OpenAPI spec drives generated TypeScript models, a native fetch client, a Fastify service interface, and React Query v5 hooks, and a React frontend wires them together with auth and cross-field validation.

Per the testing strategy (see [`TESTING.md`](../../TESTING.md)), there is exactly one rich full-stack reference and everything else is thin. This is that one app. New end-to-end concerns (auth, a validation extension, error mapping) get folded in here rather than spawned into a parallel full-stack clone. `petstore-express` is the thin backend smoke and `petstore-hono` is a retained legacy Hono surface; neither is the canonical reference.

---

## What it demonstrates

The full loop, from one spec to a working browser flow:

- **One spec, four artifacts.** The generators read the spec and emit TypeScript models, a native fetch client, a Fastify router plus a `Service` interface, and React Query hooks. No hand-written client glue.
- **`createContext` auth seam.** The generated Fastify router calls a `createContext` callback per request. `authApp.ts` reads the `Authorization` header, rejects secured routes without a Bearer token (`HttpError(401)`), and threads a typed `AuthContext` (`{ userId, scopes }`) into every secured service method.
- **Conditional cross-field validation.** `src/auth-schemas.ts` carries a hand-written Zod `superRefine`: on `/contact`, when `method === 'email'` the `email` field is required, and when `method === 'phone'` the `phone` field is required. This rule is owned by humans, never generated.
- **React frontend with typed hooks.** `src/client/App.tsx` logs in for a bearer token (`useLogin`), holds it in a module (`token.ts`), then submits the secured `/contact` form (`useContact`).
- **Error round-trip onto a form field.** The generated client runs `ContactRequestSchema.parse(body)` before the request, so a cross-field failure throws a path-tagged `ZodError`. The frontend reads `issue.path[0]` and places the message on the exact field (`email` or `phone`) that failed. The browser e2e asserts the error lands on the email slot, then a valid submit succeeds. The matching server-side 400 path is covered by the inject tests.

---

## Two generation targets

The app generates from two specs, each with its own config files:

| Target | Spec | Output | What it adds |
|---|---|---|---|
| Pet API | `../petstore-shared/spec/api.json` | `generated/` | Pets CRUD plus lab routes. Shared contract reused by all three petstore apps. |
| Auth Lab | `spec/auth-lab.json` | `generated-auth/` | A minimal secured spec: login plus secured `/me` and `/contact`, with `createContext` auth and react-query hooks. |

`pnpm generate` runs five generator CLI invocations across three generators:

1. `openapi-zod-ts` on the pet spec into `generated/`
2. `openapi-zod-ts` on the auth-lab spec into `generated-auth/` (reads `src/auth-schemas.ts`)
3. `openapi-server` on the pet spec (Fastify router) into `generated/`
4. `openapi-server` on the auth-lab spec (Fastify router, `context_type: AuthContext`) into `generated-auth/`
5. `openapi-react-query` on the auth-lab spec into `generated-auth/`

Both generated directories are gitignored and regenerated on every run, so nothing can drift. The fifth published generator, `@codewithagents/openapi-msw`, is not used here; MSW handlers are exercised in `integration/`, not in this app.

---

## How to run

```bash
pnpm install
pnpm build          # generate + vite build (writes the frontend to ./dist)
```

Scripts:

| Script | What it does |
|---|---|
| `pnpm generate` | Run the five generator CLIs (see above). Every other script runs this first. |
| `pnpm start` | Pet API server only, on port 3003 (`src/server/index.ts`). |
| `pnpm dev` | Vite dev server plus the full-stack auth server (`fullstackServer.ts`) via `concurrently`. |
| `pnpm build` | Generate, then `vite build` the React frontend into `./dist`. |
| `pnpm test` | Vitest: route inject tests, lab-route inject tests, and the auth runtime tests. |
| `pnpm test:e2e` | Playwright against the pet API (query coercion, header validation, non-JSON content types, status shapes). |
| `pnpm test:e2e:auth` | Build, then Playwright drives the full browser flow on port 3004: login, cross-field error round-trip, success. |
| `pnpm typecheck` | Generate, then `tsc --noEmit` over app and generated code. |

The full-stack auth server (`fullstackServer.ts`, port 3004) serves the built React app plus the auth API on a single port. `index.ts` (port 3003) serves only the pet API.

---

## File map

```
spec/auth-lab.json            Local secured spec (login + /me + /contact)
src/
  auth-schemas.ts             Hand-written Zod, including the /contact cross-field superRefine
  server/
    index.ts                  Pet API server (port 3003)
    fullstackServer.ts        Full-stack auth server: frontend + auth API (port 3004)
    authApp.ts                buildAuthApp + AuthContext + createContext auth seam
    petService.ts             PetstoreService implementation (in-memory)
  client/
    App.tsx                   React UI: login view + secured contact form, error round-trip
    main.tsx                  React entry point
    token.ts                  Module-level bearer token holder
  __tests__/
    routes.test.ts            Pet route inject tests
    lab-routes.test.ts        Lab-route inject tests (query coercion, headers, content types)
    auth-routes.test.ts       Auth runtime: createContext threading, 401, cross-field 400/200
e2e/
  pets.spec.ts, lab.spec.ts   Pet API Playwright specs
e2e-auth/
  auth.spec.ts                Full browser flow: login + cross-field round-trip + success
generated/                    Pet API: models, fetch client, Fastify router, service (gitignored)
generated-auth/               Auth Lab: models, client, router, service, react-query hooks (gitignored)
```

---

## CI

This package runs as jobs inside `ci.yml`, not a standalone E2E workflow. The jobs are `typecheck:generated`, `server-examples`, `e2e-fastify` (pet API Playwright), and `e2e-fastify-fullstack` (the browser auth flow). See [`TESTING.md`](../../TESTING.md) for how the layers fit together.

---

## The toolchain

| Package | Role |
|---|---|
| [`openapi-zod-ts`](../openapi-zod-ts) | Generator: TypeScript models, fetch client, Zod schemas |
| [`@codewithagents/openapi-server`](../openapi-server) | Generator: service interface plus optional `hono` \| `express` \| `fastify` \| `none` router (default `none`). Fastify is what this app ships. |
| [`@codewithagents/openapi-react-query`](../openapi-react-query) | Generator: React Query v5 hooks |
| [`@codewithagents/openapi-msw`](../openapi-msw) | Generator: MSW v2 handlers with seeded mock data (not used in this app) |
| [`@codewithagents/api-errors`](../api-errors) | Runtime helper: map API error responses to form-field errors |
