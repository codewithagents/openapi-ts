# codewithagents/openapi-zod-ts monorepo

## Stack
- **pnpm** workspace (`packageManager: pnpm@10.30.3`) — never use npm/yarn at root
- **TypeScript 6** (actively supported), `"type": "module"` everywhere, `NodeNext` module resolution
- **vitest** for all tests

## Packages
| Package | Purpose |
|---|---|
| `packages/api-errors` | Map API errors to form field errors |
| `packages/openapi-zod-ts` | Generate TS models + fetch client + Zod from OpenAPI 3.1 |
| `packages/openapi-react-query` | Generate React Query v5 hooks (depends on openapi-zod-ts) |
| `packages/integration` | Private cross-package test harness, committed sample output |
| `examples` | 128 real-world OpenAPI specs — compatibility matrix + 11 showcase specs with committed output |

## Before pushing
Run `pnpm fallow:audit` — catches dead code, duplication, and unresolved imports against the current diff before CI does.

## Key rules
- **OpenAPI 3.x** — 3.1.x (including 3.1.1) is the primary target; 3.0.x is best-effort
- **Never commit real/internal API specs** — all fixtures must be fictional
- Build order matters: `openapi-zod-ts` must be built before `openapi-react-query`
- `pnpm -r run build` / `pnpm -r run test` / `pnpm -r run lint` at root
- **Coverage thresholds are mandatory**: any package with a `test:coverage` script must declare `thresholds` in its `vitest.config.ts`. Seed below current with margin, then ratchet up. Without a floor, coverage silently rots.
- **The 128-spec compat matrix is carved out**: `compat-matrix.test.ts` is excluded from `test` / `test:coverage` and runs via `test:matrix` in the path-filtered Showcase workflow, not on the required merge gate.

## Release pipeline
- **Release Please** — automatic versioning from conventional commits; config in `release-please-config.json`
- **npm publish** via OIDC Trusted Publishing (no stored token) — triggered by Release Please release creation
- Manifest seeded in `.release-please-manifest.json`; `bootstrap-sha` in config prevents unbounded history scans
- **Never bump versions manually** — merge your PR, wait for Release Please to open its release PR, merge that; the publish workflow fires automatically
- **No major version increases without human approval** — if Release Please proposes a major bump, stop and confirm with Benjamin before merging

## CI
| Workflow | Triggers | What it does |
|---|---|---|
| `CI` | Every PR | Build + Lint + Test |
| `Examples` | Path-filtered (`packages/openapi-zod-ts/**`, `examples/**`) + weekly | Generate all 128 specs (compat matrix), verify 11 showcase specs haven't drifted, typecheck |
| `E2E` | Every PR | Petstore Playwright tests |
| `CodeQL` | Every PR | Security scanning |

- All checks must pass before merge — squash merge strategy
