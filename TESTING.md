# Testing and examples strategy

Why this file exists: the test and example surfaces in this monorepo should be added **by design, not by accretion**. Before adding a new test package or example app, read this and place the new coverage in the cheapest layer that can hold it. The goal is **one rich end-to-end reference and thin everything-else**, never a new example app per feature combination.

## The layers

We test along a few independent axes. Each axis belongs to the cheapest layer that can cover it. Push every new assertion down to the lowest layer that can hold it: a new codegen rule is a unit test, not a new example; a new framework is a thin smoke, not a full-stack clone.

| Layer | Proves | Keep it |
|---|---|---|
| **Package unit tests** | codegen and library correctness, exhaustively | rich: carries the bulk of correctness |
| **`integration/`** | the published packages compose; output visible in PRs | committed output, drift-checked |
| **`examples/`** | real-world breadth (128 specs) + showcase drift/typecheck | committed showcase + generated compat matrix |
| **Backend smoke apps** (`petstore-*`) | each framework's generated router compiles and runs | thin: inject/e2e smoke only |
| **One full-stack reference** | the whole loop: auth, shared Zod, FE hooks, error round-trip | exactly one, on the framework we ship |

## Current surfaces (inventory)

| Surface | Role | Tests | Generated output |
|---|---|---|---|
| `openapi-zod-ts` | core generator (models + fetch client + Zod) | vitest unit + coverage | n/a |
| `openapi-server` | service interface + framework router | vitest unit + coverage | n/a |
| `openapi-react-query` | React Query v5 hooks | vitest unit + coverage | n/a |
| `openapi-msw` | MSW handlers + seeded mocks | vitest unit + coverage | n/a |
| `api-errors` | API errors to form-field errors | vitest unit + coverage | n/a |
| `integration/` | cross-package composition | vitest | committed sample output |
| `examples/` | 128-spec compat matrix + 11 showcase specs | `generate.sh` + showcase drift + typecheck | showcase committed, matrix generated in CI |
| `petstore-hono` | full-stack (Hono backend + React frontend + react-query) | Playwright e2e | gitignored, regenerated each run. Owns the shared `spec/api.json` + `src/schemas.ts` reused by the other two petstores |
| `petstore-express` | Express backend smoke | vitest inject + typecheck | gitignored, regenerated each run |
| `petstore-fastify` | Fastify backend smoke + auth lab (`generated-auth/`, `createContext`) | vitest inject + auth runtime + typecheck + Playwright e2e | gitignored, regenerated each run |

CI jobs that run these: **Build, Lint & Test** (all unit tests + coverage), **Server Examples** (petstore-express + petstore-fastify typecheck + test), **E2E (Petstore)** (petstore-hono Playwright), **E2E (Petstore Fastify)**, **Showcase (Drift + Typecheck)** (examples), plus CodeQL and Code Intelligence.

## Anti-stale policy

Generated code must never be stale without anyone noticing. There are exactly two sanctioned strategies:

1. **Regenerate-on-run + gitignore** (the petstore apps). Every script runs `pnpm generate &&` first and the generated directory is gitignored. Nothing is committed, so nothing can drift. Use this for example apps.
2. **Commit + drift-gate** (`integration/`, `examples/` showcase). Output is committed so reviewers see it in the diff, and CI fails on drift: the **Showcase "Drift + Typecheck"** check, reinforced by `openapi-zod-ts --check` and `drift: 'error'` config. Use this when the output must be visible in review.

Rules:
- Never commit generated output without a drift gate.
- Never ship an example app that does not regenerate before it runs.
- When an app needs more than one generation target, add extra `--config` runs to its `generate` script and keep each target single-project, so the shared `_shared/` location does not move.

## The anti-bloat rule

There is **exactly one** rich full-stack reference app. Everything else is thin. Before creating a new example app, ask in order:

1. Can a unit test cover this? Then write a unit test.
2. Is it only "does framework X's generated router run"? Then a thin backend smoke (like `petstore-express`), inject/e2e only.
3. Is it a new end-to-end concern (auth, validation extension, error mapping)? Then add it to the one full-stack reference. Do not spawn a parallel full-stack app.

Two full-stack apps is the bloat smell. If you find yourself building a second one, consolidate instead.

## Open decision: the canonical full-stack reference

Today the full-stack surface is accidental. `petstore-hono` is doing double duty (a Hono backend smoke **and** the only full-stack app), while the auth seam (`createContext`) lives only in Fastify and `petstore-fastify` is backend-only. The framework we invest in (Fastify) and the framework that has a frontend (Hono) do not line up.

A decision is needed before adding any full-stack coverage. Two coherent end-states:

- **(i) One synthetic reference on Fastify.** Make the canonical full-stack app Fastify with `createContext` auth and a conditional cross-field validation rule, and demote `petstore-hono` to a thin backend smoke like `petstore-express`. We then maintain exactly one full-stack app, on the framework we ship.
- **(ii) No synthetic full-stack app.** Declare the toolchain proven by unit tests + `petstore-hono`'s end-to-end loop + the Fastify auth runtime test, and let the real product's first authed slice be the proof. Zero synthetic bloat; the only un-covered combination (Fastify + auth + frontend) gets covered for real.

Until this is decided, do not add a second full-stack app.

## Checklist before adding any test surface

- [ ] Which axis does this cover, and what is the cheapest layer for it?
- [ ] Is generated output regenerate-on-run-and-gitignored, or committed-and-drift-gated?
- [ ] Am I about to create a second full-stack app? If so, stop and consolidate.
- [ ] Does CI actually run it, in the right workflow job?
