# petstore-express: Express backend smoke

Private package (`private: true`, never published). A thin backend smoke that proves a generated `@codewithagents/openapi-server` Express router compiles and runs. Nothing more.

Per the testing strategy (see [`TESTING.md`](../../TESTING.md)), each axis belongs to the cheapest layer that can cover it. "Does framework X's generated router run" is a thin smoke, not a full-stack clone. So Express gets a backend smoke here, while the rich end-to-end loop (auth, shared Zod, frontend hooks, error round-trip) lives only in the one canonical full-stack reference, [`petstore-fastify`](../petstore-fastify). `petstore-hono` is a retained legacy full-stack surface.

---

## What it proves

- The Express router generated from the shared pet spec mounts under `/api` and handles pets CRUD.
- The router validates against the same hand-written Zod schemas every petstore app reuses (`../petstore-shared/schemas.ts`).
- Both the app code and the generated output typecheck.

It does **not** test a frontend, auth, or cross-field validation. Those are the full-stack reference's job.

---

## How to run

```bash
pnpm install
pnpm test        # generate, then vitest: HTTP smoke over the generated router
pnpm typecheck   # generate, then tsc --noEmit over app + generated code
pnpm start       # generate, then run the server on port 3002
```

`pnpm test` fires real HTTP at the in-process app with supertest (create a pet returns 201, list returns the pet, get by id, delete returns 204, empty list initially). Every script runs `pnpm generate` first, so the generated router is never stale.

---

## Generation

```bash
pnpm generate    # openapi-zod-ts (models + client) then openapi-server (Express router)
```

Both read `../petstore-shared/spec/api.json`; `openapi-server` also reads `../petstore-shared/schemas.ts` for the hand-written Zod rules. Output lands in `generated/`, which is gitignored and regenerated on every run, so nothing can drift.

---

## File map

```
openapi-zod-ts.config.json    Points the model/client generator at the shared spec
openapi-server.config.json    Express router target, reads the shared spec + schemas
src/
  server/
    index.ts                  Express app: app.use('/api', createRouter(petService))
    petService.ts             PetstoreService implementation (in-memory)
  __tests__/
    routes.test.ts            supertest HTTP smoke over the generated router
generated/                    models, fetch client, Express router, service (gitignored)
```

---

## The toolchain

| Package | Role |
|---|---|
| [`openapi-zod-ts`](../openapi-zod-ts) | Generator: TypeScript models, fetch client, Zod schemas |
| [`@codewithagents/openapi-server`](../openapi-server) | Generator: service interface plus optional `hono` \| `express` \| `fastify` \| `none` router (default `none`). This app targets `express`. |
| [`@codewithagents/openapi-react-query`](../openapi-react-query) | Generator: React Query v5 hooks |
| [`@codewithagents/openapi-msw`](../openapi-msw) | Generator: MSW v2 handlers with seeded mock data |
| [`@codewithagents/api-errors`](../api-errors) | Runtime helper: map API error responses to form-field errors |
