# @codewithagents/api-errors

[![npm](https://img.shields.io/npm/v/@codewithagents/api-errors.svg)](https://npmjs.com/package/@codewithagents/api-errors)
[![CI](https://github.com/codewithagents/openapi-zod-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/codewithagents/openapi-zod-ts/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/codewithagents/openapi-zod-ts/graph/badge.svg?flag=api-errors)](https://codecov.io/gh/codewithagents/openapi-zod-ts)
[![CodeQL](https://github.com/codewithagents/openapi-zod-ts/actions/workflows/codeql.yml/badge.svg)](https://github.com/codewithagents/openapi-zod-ts/actions/workflows/codeql.yml)

**[Full documentation](https://openapi.codewithagents.de/api-errors)**

`@codewithagents/api-errors` maps backend API error responses to form field errors in one call: it auto-detects RFC 9457 Problem Details, Spring Boot, Laravel, Zod, JSON:API, and ten other error shapes, then wires the result to React Hook Form, Formik, or TanStack Form with zero runtime dependencies.

It is the runtime helper in the [openapi-zod-ts toolchain](#ecosystem): the four generators emit your types, client, hooks, and mocks, and `api-errors` maps the error responses those servers return back onto your form fields at runtime.

- **Framework-agnostic core.** `extractFieldErrors(error)` returns normalized `{ field, message }` pairs from any supported error shape. `extractErrors(error)` returns the richer `{ fieldErrors, formErrors, format }` result with a separate channel for global (non-field) messages.
- **Form adapters.** React Hook Form (`mapApiErrors`), Formik (`mapApiErrorsFormik`), TanStack Form v1 (`mapApiErrorsTanstack`), and a plain record (`mapApiErrorsToRecord`). Each is one call at the catch site, no mapping loop. The adapters use structural typing, so no form-library import or peer dependency is required.
- **Ten built-in parsers.** RFC 7807 / RFC 9457 Problem Details (`errors` map, `violations`, `invalid-params`, top-level `detail`), JSON:API, GraphQL `extensions`, Spring Boot validation, Laravel / DRF field maps, Zod `.flatten()`, and flat object / array shapes. The format is detected automatically. Register your own with the `parsers` option.
- **Response unwrapping.** Detects `{ status, body }` (`ApiError` from `openapi-zod-ts`), `error.response.data` (Axios), and generic `{ data }` wrappers automatically.
- **i18n and status filtering.** `resolveMessage` translates every message before it is returned; `statusCodes` restricts parsing to specific HTTP status codes.
- **Never throws.** All functions return empty results for unrecognized or null input.
- **Zero runtime dependencies.** Pure TypeScript, full type declarations, nothing third-party added to your bundle.

## Installation

```bash
npm install @codewithagents/api-errors
```

## Public API

Six functions cover every use case. The core pair parses any error shape; the adapters wrap it for a specific form library.

| Function | What it does |
| --- | --- |
| `extractErrors(error, options?)` | Parses any error shape. Returns `{ fieldErrors, formErrors, format }`. Keeps global errors in a dedicated `formErrors` channel and reports the matched `format`. Recommended for new code. |
| `extractFieldErrors(error, options?)` | Parses any error shape. Returns normalized `FieldError[]`. Global errors fall back to `fallbackField`. Framework-agnostic. |
| `mapApiErrors(error, setError, options?)` | React Hook Form adapter. Calls `setError` once per field with `type: 'server'`. |
| `mapApiErrorsToRecord(error, options?)` | Vanilla adapter. Returns a `Record<field, message>` of each field's first message. |
| `mapApiErrorsFormik(error, setErrors, options?)` | Formik adapter. Calls `setErrors` with the record from `mapApiErrorsToRecord`. |
| `mapApiErrorsTanstack(error, form, options?)` | TanStack Form v1 adapter. Calls `form.setFieldMeta` per field to inject server errors. |

## Usage

### With React Hook Form

```tsx
import { useForm } from 'react-hook-form'
import { mapApiErrors } from '@codewithagents/api-errors'

function SignupForm() {
  const { register, handleSubmit, setError, formState: { errors } } = useForm()

  const onSubmit = async (data) => {
    try {
      await api.post('/signup', data)
    } catch (error) {
      // Automatically maps backend field errors to RHF setError calls
      mapApiErrors(error, setError)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('email')} />
      {errors.email && <p>{errors.email.message}</p>}
      <button type="submit">Sign up</button>
    </form>
  )
}
```

`mapApiErrors` accepts any function matching `(field: string, error: { type: string; message: string }) => void`, which is compatible with RHF's `UseFormSetError<T>`. No casting needed for typed forms:

```tsx
type FormValues = { email: string; name: string }

const { setError } = useForm<FormValues>()

// works: setError is assignable to the expected signature
mapApiErrors(error, setError)
```

### With Formik

No Formik import is required. The `setErrors` parameter is typed by shape only.

```tsx
import { useFormik } from 'formik'
import { mapApiErrorsFormik } from '@codewithagents/api-errors'

const formik = useFormik({
  initialValues: { email: '', name: '' },
  onSubmit: async (values, { setErrors }) => {
    try {
      await createUser(values)
    } catch (error) {
      mapApiErrorsFormik(error, setErrors)
    }
  },
})
```

### With TanStack Form v1

No TanStack Form import is required. The `form` parameter is typed by shape only.

```ts
import { mapApiErrorsTanstack } from '@codewithagents/api-errors'

try {
  await form.handleSubmit()
} catch (error) {
  mapApiErrorsTanstack(error, form)
}
```

### With native `fetch` (no Axios)

Pass the parsed response body directly to `extractFieldErrors`:

```ts
import { extractFieldErrors } from '@codewithagents/api-errors'

const res = await fetch('/api/signup', { method: 'POST', body: JSON.stringify(data) })
if (!res.ok) {
  const body = await res.json()
  const fieldErrors = extractFieldErrors(body)
  for (const { field, message } of fieldErrors) {
    setError(field, { type: 'server', message })
  }
}
```

### Standalone with `extractFieldErrors`

Use `extractFieldErrors` when you need the normalized list without a form library:

```ts
import { extractFieldErrors } from '@codewithagents/api-errors'

try {
  await submitData(payload)
} catch (error) {
  const fieldErrors = extractFieldErrors(error)
  // [{ field: 'email', message: 'must not be blank' }, ...]
  for (const { field, message } of fieldErrors) {
    console.warn(`${field}: ${message}`)
  }
}
```

### Separating global errors with `extractErrors`

`extractFieldErrors` folds non-field messages into `fallbackField`. When you want to render global errors (for example "You do not have permission") in their own banner, use `extractErrors`. It keeps them in a separate `formErrors` channel and reports the matched `format`, so you can distinguish an unrecognized body (`format` is `null`) from a recognized body with no errors.

```ts
import { extractErrors } from '@codewithagents/api-errors'

try {
  await createUser(data)
} catch (error) {
  const { fieldErrors, formErrors, format } = extractErrors(error)

  if (format === null) {
    // Unrecognized shape: show a generic banner
    showBanner('An unexpected error occurred.')
    return
  }

  for (const { field, message } of fieldErrors) {
    setError(field, { type: 'server', message })
  }

  if (formErrors.length > 0) {
    setFormBanner(formErrors.join(' '))
  }
}
```

`ExtractResult` is the shape returned by `extractErrors`:

```ts
interface ExtractResult {
  fieldErrors: FieldError[]
  formErrors: string[]
  format: ErrorFormat | null
}
```

## Options

Every function accepts a `MapApiErrorsOptions` object.

| Option | Type | Behaviour |
| --- | --- | --- |
| `fallbackField` | `string` | Field name used when no field can be determined. Defaults to `'root'`. |
| `transformField` | `(field: string) => string` | Applied to every resolved field name, and to `fallbackField`. Maps backend camelCase to nested RHF dot-paths. |
| `statusCodes` | `number[]` | Restricts parsing to these HTTP status codes. If a detectable status is not in the list, the call returns empty immediately. If no status is detectable, parsing proceeds normally. |
| `resolveMessage` | `(message: string, field: string \| null) => string` | i18n / message reformat hook. Called for every field and form error before it is returned. `field` is `null` for global errors. |
| `parsers` | `ReadonlyArray<CustomParser>` | Custom parsers tried before the built-in ones, in order. The first non-null result wins. They receive the already-unwrapped body. |

```ts
const fieldErrors = extractFieldErrors(error, {
  // Field name used when no field can be determined (default: 'root')
  fallbackField: 'serverError',

  // Transform field names, e.g. camelCase backend to dot.path for nested RHF fields
  transformField: (f) => f.replace(/([A-Z])/g, '.$1').toLowerCase(),
})

// Options work on every function
mapApiErrors(error, setError, { statusCodes: [422] })
```

> **Note:** `transformField` is also applied to `fallbackField`. If you transform `emailAddress` to `email.address`, the fallback field name is transformed the same way.

### Localizing messages with `resolveMessage`

```ts
import { extractErrors } from '@codewithagents/api-errors'

extractErrors(error, {
  resolveMessage: (msg, field) => t(`errors.${msg}`, { defaultValue: msg }),
})
```

### Custom parsers

Register parsers for application-specific shapes. They run before the built-in parsers; return `null` to let the next one try.

```ts
import { extractErrors } from '@codewithagents/api-errors'
import type { CustomParser, ParsedErrors } from '@codewithagents/api-errors'

const myParser: CustomParser = (body): ParsedErrors | null => {
  if (typeof body !== 'object' || body === null || !('myErrors' in body)) return null
  const fieldErrors = (body as any).myErrors.map((e: any) => ({ field: e.key, message: e.text }))
  return { fieldErrors, formErrors: [] }
}

extractErrors(error, { parsers: [myParser] })
```

## Supported error formats

The format is detected automatically. Custom parsers run first; if the body is an array, the flat-array parser runs; otherwise the built-in object parsers are tried in order until the first match. See the [full format reference](https://openapi.codewithagents.de/api-errors#supported-error-formats) for the complete precedence rules and edge cases.

| Format | Recognized by |
| --- | --- |
| RFC 7807 / RFC 9457 Problem Details | `errors` object map of `field -> string \| string[]` (Spring Boot 3+, standard Problem Details) |
| RFC 9457 `violations` | `violations: [{ field, message }]` array |
| RFC 9457 `invalid-params` | `"invalid-params": [{ name, reason }]` array |
| RFC 9457 `detail` | top-level `detail` string (last-resort fallback) |
| JSON:API | `errors: [{ source: { pointer }, detail }]` array |
| GraphQL | `errors: [{ message, extensions: { field \| path } }]` array |
| Spring Boot (pre-3) | `errors: [{ field, defaultMessage }]` array |
| Laravel / DRF | top-level field map `{ field: string \| string[] }` |
| Zod `.flatten()` | `{ fieldErrors: { field: string[] }, formErrors: string[] }` |
| Flat object / array | `{ field, message }` or `[{ field, message }]` |

**RFC 7807 / RFC 9457 Problem Details with an `errors` map:**
```json
{
  "type": "https://example.com/errors/validation",
  "title": "Validation failed",
  "status": 400,
  "errors": {
    "email": ["must not be blank"],
    "name": ["too short", "must not contain numbers"]
  }
}
```

**RFC 9457 `violations` array:**
```json
{
  "status": 422,
  "violations": [{ "field": "email", "message": "must not be blank" }]
}
```

**Spring Boot default validation format (pre-3):**
```json
{
  "status": 400,
  "errors": [{ "field": "email", "defaultMessage": "must not be blank" }]
}
```

**Zod `.flatten()` output:**
```json
{
  "fieldErrors": { "email": ["Invalid email"] },
  "formErrors": ["At least one field must be provided."]
}
```

**Simple flat formats (custom APIs):**
```json
{ "field": "email", "message": "Invalid email" }
```
```json
[{ "field": "email", "message": "Invalid email" }]
```

Response wrappers are unwrapped before parsing: `{ status, body }` (`ApiError` from `openapi-zod-ts`), Axios-style `error.response.data`, and generic `{ data: { ... } }` shapes (only when `data` is a plain object).

## Known behaviour: multiple errors for the same field

See the [multiple errors per field](https://openapi.codewithagents.de/api-errors#multiple-errors-per-field) section in the docs for a full example including grouping with `Map.groupBy`.

When a backend returns multiple errors for the same field, `extractFieldErrors` returns all of them. If you pass them all to React Hook Form's `setError`, the **last call wins**; only the last message is displayed. To show all messages, group them before calling `setError`:

```ts
const fieldErrors = extractFieldErrors(error)
const grouped = Map.groupBy(fieldErrors, (e) => e.field)

for (const [field, errs] of grouped) {
  setError(field, { type: 'server', message: errs.map((e) => e.message).join(', ') })
}
```

`mapApiErrorsToRecord` (and therefore the Formik and TanStack adapters) keeps each field's **first** message instead.

## Ecosystem

`api-errors` is the runtime helper in the [openapi-zod-ts](https://github.com/codewithagents/openapi-zod-ts) toolchain. The four generators turn one OpenAPI 3.1 spec into the types, client, hooks, and mocks your app uses; `api-errors` maps the error envelopes those servers return back onto your form fields.

| Package | Role |
| --- | --- |
| [`openapi-zod-ts`](https://www.npmjs.com/package/openapi-zod-ts) | Generator: TypeScript models, native fetch client, and Zod schemas. Emits the `ApiError` class that `api-errors` unwraps automatically. |
| [`@codewithagents/openapi-server`](https://www.npmjs.com/package/@codewithagents/openapi-server) | Generator: framework-agnostic service interface plus optional `hono \| express \| fastify \| none` router. Emits the RFC 7807 / RFC 9457 envelopes `api-errors` parses. |
| [`@codewithagents/openapi-react-query`](https://www.npmjs.com/package/@codewithagents/openapi-react-query) | Generator: typed React Query v5 hooks. Call `mapApiErrors` in a `useMutation` `onError` to wire server validation to form fields. |
| [`@codewithagents/openapi-msw`](https://www.npmjs.com/package/@codewithagents/openapi-msw) | Generator: MSW v2 handlers with seeded Faker mock data, including error responses to exercise this package against. |
| **`@codewithagents/api-errors`** | Runtime helper (this package): maps server error envelopes to form-field errors. |

See the [petstore-fastify demo](https://github.com/codewithagents/openapi-zod-ts/tree/main/packages/petstore-fastify) for the canonical full-stack example that wires these together, including a cross-field validation error round-tripped from the server onto a form field.

## TypeScript

This package is written in TypeScript and ships full type declarations. No `@types` package needed.

```ts
import type {
  FieldError,
  MapApiErrorsOptions,
  ExtractResult,
  ErrorFormat,
  CustomParser,
} from '@codewithagents/api-errors'
```
