# petstore-contract (private, unpublished)

A uniform real-HTTP contract test harness for the `@codewithagents` toolchain. It proves that one API contract holds identically across all three `openapi-server` router targets: Fastify, Hono, and Express. Not a fourth example app, just a thin cross-adapter parity check.

Not published to npm (`private: true`).

## What it proves

A single vitest suite (`describe.each(['fastify','hono','express'])` in `src/__tests__/contract.test.ts`) boots each adapter on an ephemeral port (port 0) and asserts the SAME uniform invariants against all three: create returns 201 with a string id, list and filter behave, get-by-id returns the pet, delete returns 204, and a missing id maps to 404 JSON. It also pins the genuine framework divergences (invalid-body status and envelope, wrong content-type status) as a per-framework lookup table, so any regression in those shapes is caught immediately.

## Why raw HTTP, not the generated client

Requests use raw global fetch (undici in Node 22), NOT the generated client. The generated client runs `Schema.parse(body)` on the client side, which would reject an invalid payload locally and short-circuit every divergence case before it reached the wire. Raw fetch lets the harness send bad bodies and observe each framework's real error handling.

## Scope

- **Adapters**: `src/adapters/{fastify,hono,express}.ts` each mount the framework's generated router on `petService` from the matching petstore package and return a `{ baseUrl, close }` handle. `src/startServer.ts` dispatches by framework; `src/serverHandle.ts` wraps the Node `close(cb)` servers (Hono, Express) in a promise (Fastify's `close()` is already a promise).
- No frontend, no Playwright, no unit tests of its own. It is purely a real-HTTP parity gate over code the petstore packages generate.

## Regenerate-on-run

`test` and `test:coverage` chain `generate:deps` first, which regenerates all three petstore packages' `generated/` dirs from the prebuilt generator CLIs before vitest starts. Like every petstore package it assumes the generators are already built, so run `pnpm build` once first.

```bash
pnpm build                                                        # once: build the generator CLIs
pnpm --filter @codewithagents/petstore-contract test             # generate:deps + vitest
pnpm --filter @codewithagents/petstore-contract test:coverage    # generate:deps + vitest --coverage
```

## CI

In `.github/workflows/ci.yml` the job `e2e-contract` (name: `Contract (uniform real-HTTP across fastify/hono/express)`) runs `pnpm --filter @codewithagents/petstore-contract run test` after building. There is no `lint` or typecheck script: it imports the Hono generated router, which has known generator type bugs that are intentionally excluded from `typecheck:generated`, so the runtime contract suite is the gate for now.
