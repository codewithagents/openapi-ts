# Testing and examples strategy

Why this file exists: the test and example surfaces in this monorepo should be added **by design, not by accretion**. Before adding a new test package or example app, read this and place the new coverage in the cheapest layer that can hold it. The goal is **one rich end-to-end reference and thin everything-else**, never a new example app per feature combination.

## The layers

We test along a few independent axes. Each axis belongs to the cheapest layer that can cover it. Push every new assertion down to the lowest layer that can hold it: a new codegen rule is a unit test, not a new example; a new framework is a thin smoke, not a full-stack clone.

| Layer | Proves | Keep it |
|---|---|---|
| **Package unit tests** | codegen and library correctness, exhaustively | rich: carries the bulk of correctness |
| **`integration/`** | the published packages compose; output visible in PRs | committed output, drift-checked |
| **`examples/`** | real-world breadth (128 specs) + showcase drift/typecheck | committed showcase + generated compat matrix |
| **Backend smoke app** (`petstore-express`) | a generated router compiles and runs | thin: inject smoke only (fastify and hono are full-stack surfaces, see the row below) |
| **One full-stack reference** | the whole loop: auth, shared Zod, FE hooks, error round-trip | exactly one: `petstore-fastify` (Fastify, the framework we ship) |

## Current surfaces (inventory)

| Surface | Role | Tests | Generated output |
|---|---|---|---|
| `openapi-zod-ts` | core generator (models + fetch client + Zod) | vitest unit + coverage | n/a |
| `openapi-server` | service interface + framework router | vitest unit + coverage | n/a |
| `openapi-react-query` | React Query v5 hooks | vitest unit + coverage | n/a |
| `openapi-msw` | MSW handlers + seeded mocks | vitest unit + coverage | n/a |
| `api-errors` | API errors to form-field errors | vitest unit + coverage | n/a |
| `integration/` | cross-package composition | vitest | committed sample output |
| `examples/` | 128-spec compat matrix + 13 showcase specs | `generate.sh` + showcase drift + typecheck | showcase committed, matrix generated in CI |
| `petstore-shared` | the shared pet OpenAPI spec + hand-written Zod schemas (the contract all three petstores reuse) | lint (standalone schema typecheck) | committed; consumed via relative config paths |
| `petstore-fastify` | **canonical full-stack reference**: Fastify + `createContext` auth + cross-field validation + React/react-query frontend | vitest inject + auth runtime + typecheck + API e2e + browser e2e (login + cross-field round-trip) | gitignored, regenerated each run |
| `petstore-hono` | retained full-stack Hono+React e2e surface (keeps Hono+react-query coverage; no longer the canonical reference) | Playwright e2e | gitignored, regenerated each run |
| `petstore-express` | Express backend smoke | vitest inject + typecheck | gitignored, regenerated each run |
| `petstore-contract` | thin cross-adapter contract-parity gate: one contract, three adapters (Fastify, Hono, Express) | vitest real-HTTP suite over all three adapters on ephemeral ports | consumes the three petstores' output, regenerated each run |

The actual workflow files are `ci.yml`, `examples.yml`, `smoke.yml`, `mutation.yml`, `fallow.yml`, `codeql.yml`, `docs-deploy.yml`, and `release.yml`. There is no standalone E2E workflow: the petstore Playwright and inject suites run as jobs inside `ci.yml`. Mapped to the surfaces above: `ci.yml` (Build + Lint + Test + coverage for all unit tests, plus the petstore-express/petstore-fastify typecheck + inject jobs, the petstore-fastify and petstore-hono Playwright e2e jobs, and the `Contract (uniform real-HTTP across fastify/hono/express)` job that runs petstore-contract), `examples.yml` (Showcase: generate the 128 specs, drift-check + typecheck the 13 committed showcase outputs), `smoke.yml` (live API smoke), `mutation.yml` (Stryker), `fallow.yml` (static analysis / Code Intelligence), and `codeql.yml` (security).

## Anti-stale policy

Generated code must never be stale without anyone noticing. There are exactly two sanctioned strategies:

1. **Regenerate-on-run + gitignore** (the petstore apps). Every script runs `pnpm generate &&` first and the generated directory is gitignored. Nothing is committed, so nothing can drift. Use this for example apps.
2. **Commit + drift-gate** (`integration/`, `examples/` showcase). Output is committed so reviewers see it in the diff, and CI fails on drift: the **Showcase "Drift + Typecheck"** check, reinforced by `openapi-zod-ts --check` and `drift: 'error'` config. Use this when the output must be visible in review.

Rules:
- Never commit generated output without a drift gate.
- Never ship an example app that does not regenerate before it runs.
- When an app needs more than one generation target, add extra `--config` runs to its `generate` script and keep each target single-project, so the shared `_shared/` location does not move.

## The anti-bloat rule

There is **exactly one** canonical rich full-stack reference app (`petstore-fastify`); `petstore-hono` is a retained legacy surface, not a second reference. Everything else is thin. Before creating a new example app, ask in order:

1. Can a unit test cover this? Then write a unit test.
2. Is it only "does framework X's generated router run"? Then a thin backend smoke (like `petstore-express`), inject/e2e only.
3. Is it a new end-to-end concern (auth, validation extension, error mapping)? Then add it to the one full-stack reference. Do not spawn a parallel full-stack app.

`petstore-hono` is the sanctioned second full-stack surface, retained as legacy to keep Hono coverage, so it is not the bloat being warned against. A net-new *third* full-stack app is the bloat smell. If you find yourself building one, fold the concern into `petstore-fastify` instead.

`petstore-contract` is also not bloat: it is a thin cross-adapter contract-parity layer, not a fourth app. It owns no spec, no frontend, and no business logic. It simply boots the three generated routers over real HTTP and proves they honour one contract identically (uniform invariants) while pinning their genuine framework divergences. That is exactly the kind of thin smoke this doc endorses (proving framework-router parity), pushed to the cheapest layer that can hold it.

## Resolved: the canonical full-stack reference

**Decision: end-state (i).** `petstore-fastify` is the one canonical full-stack reference: Fastify + `createContext` auth + a conditional cross-field validation rule + a React/react-query frontend + a browser e2e that round-trips the cross-field error onto a form field. The shared pet contract was relocated to `petstore-shared`, so no example app owns it.

`petstore-hono` is **retained, not deleted**: it keeps its Hono + React + react-query e2e as a second full-stack surface, so that coverage is not lost, but it is no longer the canonical reference. Its e2e should move off the every-PR critical path to a path-filtered tier in the CI restructure.

There is still exactly **one canonical** full-stack reference. Do not add a third.

## Checklist before adding any test surface

- [ ] Which axis does this cover, and what is the cheapest layer for it?
- [ ] Is generated output regenerate-on-run-and-gitignored, or committed-and-drift-gated?
- [ ] Am I about to create a second full-stack app? If so, stop and consolidate.
- [ ] Does CI actually run it, in the right workflow job?
