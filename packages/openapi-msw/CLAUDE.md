# @codewithagents/openapi-msw

Generates MSW v2 HTTP handlers with seeded Faker mock data from an OpenAPI 3.1 spec.

## What it generates

A single `handlers.ts` file containing:
- `import { http, HttpResponse } from 'msw'`
- `import { faker } from '@faker-js/faker'`
- `faker.seed(SEED)` at the top for deterministic output
- One `http.<method>(path, resolver)` handler per operation
- `export const handlers = [...]`

## Peer dependencies

`msw` and `@faker-js/faker` are peer dependencies. You must install them yourself:

```
pnpm add msw @faker-js/faker
```

The generated `handlers.ts` file imports `faker` from `@faker-js/faker` directly, so it must be present in your project.

## Non-obvious decisions

**Seeded faker**: `faker.seed(42)` (default, configurable) ensures generated output is stable across runs. The seed is emitted at the top of the generated file, not in the generator itself.

**MSW v2 path syntax**: OpenAPI `{id}` path params are converted to MSW `:id` colon-style params.

**depth_cap**: Schema recursion is terminated at depth 30 (default, configurable) with `null /* depth cap reached */` to avoid infinite loops on circular or deeply nested allOf/anyOf/oneOf schemas. The depth counter increments at each $ref hop and each allOf/anyOf/oneOf resolution step.

**allOf handling**: Properties of all allOf members are merged. anyOf/oneOf picks the first concrete (non-ref) member.

**2xx response selection**: Prefers 200, then 201, then the first 2xx code. 204 (no body) emits `HttpResponse.json(null, { status: 204 })`. Operations whose only 2xx response has a non-JSON content type (text/plain, text/csv, octet-stream, image) emit `new HttpResponse(null, { status: N })` to avoid claiming application/json.

**Peer deps**: msw and @faker-js/faker are peer dependencies. Install them in the project that uses the generated handlers.
