# codewithagents/openapi-zod-ts monorepo

## Stack
- **pnpm** workspace (`packageManager: pnpm@10.30.3`): never use npm/yarn at root
- **TypeScript 6** (actively supported), `"type": "module"` everywhere, `NodeNext` module resolution
- **vitest** for all tests; Zod v4, React Query v5

## Packages
Five published packages: four generators plus one runtime helper. npm scope is `@codewithagents` for everything except the core package (unscoped `openapi-zod-ts`).

| Package (npm) | Purpose |
|---|---|
| `openapi-zod-ts` | Core generator: TS models + native fetch client + Zod from an OpenAPI 3.1 spec |
| `@codewithagents/openapi-server` | Service interface + optional router (`hono \| express \| fastify \| none`, default `none`) |
| `@codewithagents/openapi-react-query` | React Query v5 hooks (depends on openapi-zod-ts) |
| `@codewithagents/openapi-msw` | MSW v2 handlers + seeded Faker mock data (depends on openapi-zod-ts) |
| `@codewithagents/api-errors` | Map API error responses to form-field errors (runtime helper, not a codegen step) |

Private (not published): `@codewithagents/integration` (cross-package tests, committed sample output), `@codewithagents/petstore-shared` (shared pet spec + hand-written Zod schemas, reused by the example apps via relative config paths), `petstore-fastify` (canonical full-stack reference: Fastify + createContext auth + cross-field validation + React/react-query + browser e2e), `@codewithagents/petstore-hono` (retained legacy full-stack surface, not the main demo), `petstore-express` (thin Express smoke), `@codewithagents/petstore-contract` (uniform real-HTTP contract harness proving one contract holds across the Fastify/Hono/Express adapters).

`examples`: 128 real-world OpenAPI specs = 115 matrix-only + 13 showcase (committed output in `examples/generated/`, drift-checked + typechecked).

## Before pushing
Run `pnpm fallow:audit`: catches dead code, duplication, and unresolved imports against the current diff before CI does.

## Key rules
- **OpenAPI version**: 3.1.x (incl. 3.1.1) is the primary target; 3.0.x is supported in practice (8 of the 13 showcase specs are 3.0.x and all pass `tsc --strict`; a few 3.0-only constructs are still being normalized to 3.1 semantics). No Swagger 2.0.
- **Never commit real/internal API specs**: all fixtures must be fictional
- Build order matters: `openapi-zod-ts` must be built before `openapi-react-query`
- `pnpm -r run build` / `pnpm -r run test` / `pnpm -r run lint` at root
- **Coverage thresholds are mandatory**: any package with a `test:coverage` script must declare `thresholds` in its `vitest.config.ts`. Seed below current with margin, then ratchet up. Without a floor, coverage silently rots.
- **The 128-spec compat matrix is carved out**: `compat-matrix.test.ts` is excluded from `test` / `test:coverage` and runs via `test:matrix` in the path-filtered Showcase workflow, not on the required merge gate.

## Release pipeline
- **Release Please** drives versioning from conventional commits; config in `release-please-config.json`
- **npm publish** via OIDC Trusted Publishing (no stored token), triggered by Release Please release creation
- Manifest seeded in `.release-please-manifest.json`; `bootstrap-sha` in config prevents unbounded history scans
- **Never bump versions manually**: merge your PR, wait for Release Please to open its release PR, merge that; the publish workflow fires automatically
- **No major version increases without human approval**: if Release Please proposes a major bump, stop and confirm with Benjamin before merging

## CI (`.github/workflows/`)
| Workflow | What it does |
|---|---|
| `ci.yml` | Build + Lint + Test + coverage; petstore Playwright e2e and the Contract job (uniform real-HTTP across fastify/hono/express, petstore-contract) run as jobs here (not separate workflows) |
| `examples.yml` | Showcase: generate all 128 specs, drift-check + typecheck the 13 committed (path-filtered + weekly) |
| `smoke.yml` | Live API smoke from generated clients (push-to-main + weekly) |
| `mutation.yml` | Stryker mutation testing (openapi-zod-ts, openapi-react-query) |
| `fallow.yml` | Static-analysis review comments per PR |
| `codeql.yml` | Security scanning |
| `docs-deploy.yml` | Deploy the Astro Starlight docs site |
| `release.yml` | Release Please + OIDC npm publish |

All checks must pass before merge; squash merge strategy.
