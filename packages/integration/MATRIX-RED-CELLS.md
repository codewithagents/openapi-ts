# Matrix coverage: no partial `unknown` (client + Fastify)

This is the coverage map for the "does any generated type/schema degrade to `unknown`?"
question. One fictional matrix spec (`spec/matrix.json`) exercises every
concretely-representable OpenAPI 3.1 construct in every position, generated to both
the `openapi-zod-ts` client (models + Zod + `z.infer`) and the `openapi-server`
Fastify output (service interface + router). Because every construct in the matrix
has a concrete representation, ANY `unknown` / `z.unknown()` in the output is a bug
(a "red cell").

## Result

**Red cells: 0.**

| Surface | Artifact | `unknown` found |
|---|---|---|
| Client types | `generated-matrix/models.ts` | none |
| Client Zod | `generated-matrix/schemas.ts` | none (no `z.unknown()`) |
| Client inferred | `z.infer<typeof *Schema>` | none (top-level `IsUnknownExact` belt) |
| Fastify service | `generated-matrix/service.ts` | none |
| Fastify router | `generated-matrix/router.ts` | none |

Across the entire concretely-representable surface, the generator emits fully typed
output. After this session's fixes (#383 cyclic schemas, #390 nullable arrays, the
nullable-object sibling, and multi-member structural unions), the matrix finds
nothing left to fix.

## What the matrix covers

`spec/matrix.json`: 62 component schemas, 19 paths.

Constructs (counts in the spec): primitives + formats (string/email/uuid/date-time/
date/uri, integer/int32/int64, number/float/double, boolean), string & integer
enums, string & number const, arrays (of primitive, of `$ref`, nested, tuples via
`prefixItems` x5, tuple + rest), objects (properties + required, record via
`additionalProperties`, both together), nullable in BOTH forms (3.1 `type:[X,"null"]`
x9 and 3.0 `nullable:true` x35) over string/array/object/record/`$ref`, composition
(`allOf` x18 incl. sibling props, `anyOf` x14 incl. with `"null"`, `oneOf` x18,
`oneOf` + `discriminator` x3), references and recursion (`$ref` x130, direct
self-cycle, mutual cycle, cycle through composition), and multi-type unions
(`["string","integer"]`, `["string","integer","null"]`, `["object","string","null"]`).

Positions: top-level component, object property, array item, `anyOf`/`oneOf` member,
`allOf` member, `additionalProperties` value, request body, 200 response body (client
return + Fastify service return), and query/path params.

## How it's detected (and why this way)

- **Primary: source-text scan** (`src/__tests__/matrix-no-zunknown.test.ts`). It
  scans the generated `models.ts`/`service.ts` for a bare ` unknown` token and
  `schemas.ts`/`router.ts` for `z.unknown()`. Because `models.ts` is the fully
  expanded type source, this is a depth-complete, recursion-safe detector: an
  `unknown` nested at any depth appears as a literal token.
- **Secondary: type-level belt** (`src/matrix-no-unknown.assert.ts`). A
  non-recursive `IsUnknownExact<z.infer<typeof Schema>>` check per schema catches the
  #383 shape, where the inferred type collapses to `unknown` while the source has no
  literal `"unknown"`.
- **Why not the deep recursive `DeepHasUnknown` here:** on the matrix's densely
  cross-referenced types (130 `$ref`s, cycles) TypeScript defers the recursive
  conditional to `boolean`, producing false positives. The text scan replaces its
  depth coverage robustly; `DeepHasUnknown` remains in use for the self-contained
  curated examples (`examples/type-assertions.ts`).

## Teeth (the detector is not vacuous)

`spec/matrix-legit-unknown.json` holds the constructs that *should* be `unknown`
(`additionalProperties: true`, empty `{}`, `not`, object-valued enum). The test
asserts `generated-matrix-legit/models.ts` DOES contain `unknown`, proving the scan
fires on real unknowns and pinning those cases as intentional.

## Regeneration

`pnpm --filter @codewithagents/integration run generate:matrix` regenerates the
committed `generated-matrix/` output deterministically. The matrix output is
typechecked by integration's `lint` (`tsc --noEmit`), which runs in CI via
`typecheck:generated`, and the scans run under integration's `test`.
