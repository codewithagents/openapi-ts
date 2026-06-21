# api-errors

Published as `@codewithagents/api-errors` (v1.2.0). This is a runtime helper used in app code, not a codegen step (unlike the four generators: openapi-zod-ts, openapi-server, openapi-react-query, openapi-msw).

Map backend API errors to form field errors. Zero runtime dependencies.

## What it does
- Parses RFC 9457 / RFC 7807 Problem Details + custom error shapes from HTTP responses
- Maps field paths from supported error formats to normalized `{ field, message }` pairs
- Framework adapters (React Hook Form, Formik, TanStack Form) live in `src/index.ts` alongside the framework-agnostic core `extractFieldErrors`

## Supported error formats
- RFC 7807 / RFC 9457 `errors` map: `{ "errors": { "email": ["must not be blank"] } }`
- Spring Boot array format: `{ "errors": [{ "field": "email", "defaultMessage": "..." }] }`
- Flat object: `{ "field": "email", "message": "..." }`
- Array of flat objects: `[{ "field": "email", "message": "..." }]`
- RFC 9457 top-level `detail` string (last-resort fallback)

## Exports (`src/index.ts`)
- `extractFieldErrors(error, options?)`: framework-agnostic core; returns `FieldError[]`
- `extractErrors(error, options?)`: lower-level core; returns the full `ExtractResult` (field errors + form-level errors)
- `mapApiErrors(error, setError, options?)`: React Hook Form adapter; calls `setError` per field
- `mapApiErrorsToRecord(error, options?)`: returns a `Record<field, message>`
- `mapApiErrorsFormik(error, setFieldError, options?)`: Formik `setFieldError` adapter
- `mapApiErrorsTanstack(error, options?)`: TanStack Form adapter
- Types: `FieldError`, `ParsedErrors`, `ErrorFormat`, `CustomParser`, `ExtractResult`, `MapApiErrorsOptions`

## Key decisions
- **Body unwrapping**: detects `{ status, body }` shape (ApiError from generated client), `error.response.data` (Axios), and `{ data }` wrappers; unwraps before parsing
- **`statusCodes` option**: caller can filter which HTTP status codes trigger error mapping
- **`tryParseRfc9457Detail`**: last-resort fallback; parses top-level `detail` string as error message
- No runtime deps: pure TypeScript, framework-agnostic core

## Test / build
```
pnpm test           # vitest run
pnpm test:coverage  # vitest run --coverage (thresholds gate in vitest.config.ts)
pnpm build          # tsc
```

Coverage thresholds are mandatory and gate PRs: statements/functions/lines 90, branches 85 (seeded below current; ratchet up). Stryker mutation testing runs via `pnpm test:mutation`.
