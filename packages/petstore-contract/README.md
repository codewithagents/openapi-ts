# petstore-contract

A uniform real-HTTP contract test harness that proves one API contract holds across three framework
adapters: Fastify, Hono, and Express.

## What it proves

A single vitest suite (`describe.each(['fastify','hono','express'])`) boots each adapter on an
ephemeral port (port 0), hits it with raw HTTP, and asserts the same uniform invariants against
all three. It also pins known divergence behaviour so any regression is caught immediately.

**Why raw fetch instead of the generated client?**

The generated client runs `Schema.parse(body)` on the client side before sending. An invalid
payload would be rejected locally and never reach the server, short-circuiting all divergence
cases. Raw global fetch (undici in Node 22) bypasses that, so we can send bad bodies and observe
real per-framework error handling.

## Regenerate-on-run model

The `test` and `test:coverage` scripts chain `generate:deps` first, which regenerates all three
petstore packages' `generated/` dirs from the prebuilt generator CLIs before vitest starts. This
keeps the harness honest: it always tests freshly generated code. Like every petstore package, it
assumes the generators are already built, so run `pnpm build` once first (every CI job that runs the
suite does this).

```
pnpm build   # once: builds the generator CLIs
pnpm --filter @codewithagents/petstore-contract test
pnpm --filter @codewithagents/petstore-contract test:coverage
```

## Uniform invariants (all three frameworks must pass)

1. POST /api/pets with valid body returns 201, string id, matching name/species.
2. GET /api/pets returns 200 array containing all created pet ids.
3. GET /api/pets?species=cat returns only cats (includes the one you created).
4. GET /api/pets/:id returns 200 with the exact pet.
5. DELETE /api/pets/:id returns 204 with empty body.
8. GET /api/pets/:id for a never-created id returns a uniform 404 JSON not-found body across all three frameworks.

## DIVERGENCES

Genuine framework-architecture differences, locked down as a per-framework lookup table.

| Scenario | fastify | hono | express |
|---|---|---|---|
| Invalid body (name='') | 400, code: FST_ERR_VALIDATION | 422, error: 'Invalid request body', issues: [] | 422, error: 'Invalid request body', issues: [] |
| Wrong content-type (text/plain) | 400 | 415 | 422 |

The missing-pet case used to diverge: petstore-express returned a 500 (its `getPet` threw a plain
`Error` that fell through to the default 500 handler) while Fastify and Hono returned 404. That bug
was fixed, so all three now return a uniform 404 JSON not-found body, pinned as invariant 8 above
rather than a divergence.

## Typecheck note

This package has no `lint` or `tsc --noEmit` script. It imports the Hono generated router, which
has known generator type bugs (readOnly/writeOnly response types, octet-stream BodyInit) that are
intentionally excluded from `typecheck:generated`. Runtime contract tests are the gate for now.
Full type-gating lands in the later PR that fixes those Hono type bugs.
