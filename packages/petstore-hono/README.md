# Petstore (Hono): Retained Legacy Full-Stack Surface

> **This is no longer the canonical full-stack reference.** The canonical full-stack demo is [`packages/petstore-fastify`](https://github.com/codewithagents/openapi-zod-ts/tree/main/packages/petstore-fastify): Fastify with `createContext` auth, a cross-field validation rule, a React + react-query frontend, and browser e2e that round-trips a cross-field error onto a form field. Fastify is the framework the project ships. Start there.

This package is the **retained legacy Hono surface**. It keeps Hono router coverage plus a React + react-query Playwright e2e round-trip against the shared pet contract. It is kept because it still exercises the Hono router target of `@codewithagents/openapi-server` in a production-shaped project, but it is not where new readers should begin.

> **Not published to npm.** This is a reference implementation. Clone the monorepo and run it locally.

> **Hono is this demo's choice, not a requirement.** The core of `openapi-server` is `service.ts`, a plain TypeScript interface with no framework imports. This petstore wires it to Hono, but `openapi-server` also targets `express`, `fastify`, or `none` (default `none`, framework-agnostic). The canonical app targets `fastify`.

> **Scope.** This demo exercises the core generators (`openapi-zod-ts`, `@codewithagents/openapi-server`, `@codewithagents/openapi-react-query`). It does not exercise `@codewithagents/openapi-msw` (MSW mock generation) or `@codewithagents/api-errors` (runtime error-to-field mapping), which are also part of the toolchain.

---

## What this demonstrates

| Layer | Technology | Generated from spec? |
|---|---|---|
| TypeScript types | `models.ts` | ✅ `openapi-zod-ts` |
| Fetch client | `client.ts` | ✅ `openapi-zod-ts` |
| React Query hooks | `hooks.ts` | ✅ `@codewithagents/openapi-react-query` |
| Server interface (framework-agnostic) | `service.ts` | ✅ `@codewithagents/openapi-server` |
| Router + Zod validation (Hono target) | `router.ts` | ✅ `@codewithagents/openapi-server` |
| Zod schemas | `../petstore-shared/schemas.ts` | ⚠️ Hand-written, owned by `petstore-shared` |
| Business logic | `src/server/petService.ts` | ❌ You write this |
| React UI | `src/client/App.tsx` | ❌ You write this |

**The key insight:** everything in `generated/` is disposable and not committed to git. Change the shared spec, run `pnpm generate`, and the types, client, hooks, and router update automatically. Your business logic in `src/` is untouched because it implements a stable TypeScript interface.

The pet OpenAPI spec and the hand-written Zod schemas live in [`@codewithagents/petstore-shared`](../petstore-shared), not in this package. They are the shared contract that the petstore example apps reuse via relative config paths. Generators never overwrite those schemas.

---

## Quick start

**Prerequisites:** Node.js ≥ 22, pnpm ≥ 10

**1. Clone the monorepo and install dependencies:**

```bash
git clone https://github.com/codewithagents/openapi-zod-ts.git
cd openapi-zod-ts
pnpm install
```

**2. Build the generator packages:**

```bash
pnpm build
```

**3. Start the petstore in dev mode:**

```bash
cd packages/petstore-hono
pnpm dev
```

This starts two servers concurrently:
- **Vite** on `http://localhost:5173`, the React frontend with hot reload
- **Hono** on `http://localhost:3001`, the API server (Vite proxies `/api` requests to it)

Open `http://localhost:5173` and you'll see a pet management UI. Add a pet, delete a pet, the full round-trip is live.

---

## The Zod validation story

This is the part that ties everything together. The Zod schemas live in the shared contract at `../petstore-shared/schemas.ts`:

```ts
// Hand-written and owned by @codewithagents/petstore-shared. Generators never overwrite it.
import { z } from 'zod'

export const PetSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    species: z.string(),
  })
  .passthrough()

export const CreatePetRequestSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  species: z.string().min(1, 'Species is required'),
})
```

The `.min(1, ...)` rules are real business rules, they weren't in the spec. This is logic the contract owns.

Now look at the generated `router.ts`:

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

The router was generated because `openapi-server.config.json` points `input_schema` at `../petstore-shared/schemas.ts`. The generator found `CreatePetRequestSchema`, wired it into the route, and now invalid requests return a structured `422` before they ever reach your service implementation.

**The full round-trip:**
```
Browser form submit
  → POST /api/pets { name: "", species: "Dog" }
  → Hono router → CreatePetRequestSchema.safeParse()
  → 422 { error: "Invalid request body", issues: [{ path: ["name"], message: "Name is required" }] }
  → React renders the error message next to the name field
```

---

## Regenerating from the spec

When the shared spec changes, regenerate all output files:

```bash
pnpm generate
```

This runs the three wired generators in order:
1. `openapi-zod-ts` → `models.ts`, `client.ts`, `client-config.ts`, `index.ts`
2. `@codewithagents/openapi-server` → `service.ts`, `router.ts` (with Zod validation wired in)
3. `@codewithagents/openapi-react-query` → `hooks.ts`, `test-utils.ts`

**The shared schemas are never overwritten.** They are hand-written and owned by `@codewithagents/petstore-shared`. The `generated/` directory is gitignored and recreated on every run.

The remaining generator, `@codewithagents/openapi-msw` (MSW handlers), and the `@codewithagents/api-errors` runtime helper are not exercised here. Both are covered elsewhere in the monorepo.

---

## Running E2E tests

The Playwright suite covers the full browser-to-server round-trip across multiple spec files (`e2e/pets.spec.ts` and `e2e/lab.spec.ts`, roughly 53 tests in Chromium):

```bash
pnpm test:e2e
```

This runs `pnpm generate`, builds the React app with Vite, starts the Hono server, and runs the suite. Each test resets server state before running, so tests are fully isolated.

**These tests also run in CI** as the `E2E (Petstore)` job inside the CI workflow (`.github/workflows/ci.yml`), alongside the `Build, Lint & Test` job. There is no standalone top-level E2E workflow; the petstore Playwright e2e runs as a job within `ci.yml`. The canonical Fastify app is covered by separate `E2E (Petstore Fastify)` and `E2E (Petstore Fastify Fullstack)` jobs in the same workflow.

---

## Using this as a template for your own project

The petstore is deliberately simple so the structure is easy to copy. Here's how to adapt it:

**1. Point the configs at your own spec and schemas:**

Set `input_openapi` to your OpenAPI document and `input_schema` to your hand-written Zod schemas in each config file.

**2. Regenerate:**

```bash
pnpm generate
```

All files in `generated/` are overwritten. Your hand-written schemas are never touched.

**3. Implement the service interface:**

Open `generated/service.ts`, it now reflects your spec. Create a file that satisfies the interface:

```ts
// src/server/myService.ts
import type { YourApiService } from '../generated/service.js'

export const myService: YourApiService = {
  async listItems(params) { ... },
  async createItem(body) { ... },
}
```

TypeScript will tell you at compile time if your implementation drifts from the spec.

**4. Wire it up:**

```ts
// src/server/index.ts
import { createRouter } from '../generated/router.js'
import { myService } from './myService.js'

const apiRouter = createRouter(myService)
app.route('/api', apiRouter)
```

**5. Use the hooks in React:**

```tsx
import { useListItems, useCreateItem } from '../generated/hooks.js'

function ItemList() {
  const { data } = useListItems()
  const create = useCreateItem()
  ...
}
```

---

## File structure

```
generated/                    Auto-generated, gitignored: safe to delete and re-run
  models.ts                   TypeScript types (Pet, CreatePetRequest)
  client.ts                   Typed fetch functions (zero runtime deps)
  client-config.ts            configureClient(): base URL + auth setup
  index.ts                    Barrel re-export
  service.ts                  PetstoreService interface
  router.ts                   createRouter(service): Hono routes + Zod validation
  hooks.ts                    useListPets, useCreatePet, useDeletePet (React Query)
  test-utils.ts               MSW handlers for testing hooks

src/
  server/
    petService.ts             Implements PetstoreService (in-memory Map)
    index.ts                  Hono app: mounts router, serves React build
  client/
    App.tsx                   React UI: uses generated hooks

e2e/
  pets.spec.ts                Playwright tests (browser → Hono → Zod → React)
  lab.spec.ts                 Playwright tests (extended round-trip coverage)

openapi-zod-ts.config.json       Generator config (client-side files)
openapi-server.config.json    Generator config (server files + Zod validation)
openapi-react-query.config.json  Generator config (React Query hooks)
```

The spec and hand-written Zod schemas are not in this package. They live in [`@codewithagents/petstore-shared`](../petstore-shared) and are referenced via the relative config paths below.

---

## Generator configs

**`openapi-zod-ts.config.json`**
```json
{
  "input_openapi": "../petstore-shared/spec/api.json",
  "output": "generated/",
  "input_schema": "../petstore-shared/schemas.ts"
}
```

**`openapi-server.config.json`**
```json
{
  "input_openapi": "../petstore-shared/spec/api.json",
  "output": "generated/",
  "framework": "hono",
  "input_schema": "../petstore-shared/schemas.ts"
}
```

**`openapi-react-query.config.json`**
```json
{
  "input_openapi": "../petstore-shared/spec/api.json",
  "output": "generated/"
}
```

All three share the same spec and output directory. The `input_schema` points both `openapi-zod-ts` and `openapi-server` at `../petstore-shared/schemas.ts`, so client-side and server-side validation use identical rules. The `generated/` directory is gitignored and recreated on every build.
