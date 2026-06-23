// Compile-time assertions: generated inferred types must contain no unknown in named fields.
//
// Why: the existing property test checks generated source text for the "unknown" substring.
// That proxy does NOT catch #383: a bare `z.lazy(() => ...): z.ZodType` collapses z.infer<>
// to unknown without the word "unknown" appearing in source. This file checks the INFERRED
// TypeScript types directly, recursively, at compile time.
//
// Zod v4 `.passthrough()` emits `{ [k: string]: unknown }` as an index signature on the
// inferred type (the $loose config). That is intentional and must NOT be flagged. The
// NamedKeys helper filters out wide string/number index signatures so only explicitly
// declared named properties are checked.
//
// Note on mutually recursive types (Holiday <-> Province): TypeScript 6's conditional type
// evaluator returns `boolean` (not `false`) when it encounters a recursive cycle, regardless
// of depth-limiting tricks. `[boolean] extends [false]` is false, so AssertNoUnknown would
// produce a false positive on these clean interfaces. For those types we use (a) Pick<> over
// the non-cyclic leaf fields to exercise the full machinery, and (b) a direct IsUnknownExact
// check for the z.infer<> result (the specific regression shape for #383).

import type { z } from 'zod'
import type { Holiday, Province } from './generated/canada_holidays/models.js'
import {
  HolidaySchema,
  ProvinceSchema,
  RootSchema,
  ErrorSchema,
} from './generated/canada_holidays/schemas.js'
import type { Email, Attachment, Domain, DomainRecord } from './generated/resend/models.js'
import {
  EmailSchema,
  AttachmentSchema,
  DomainSchema,
  DomainRecordSchema,
} from './generated/resend/schemas.js'
import type { ArtistObject, TrackObject, AudioFeaturesObject } from './generated/spotify/models.js'
import {
  ArtistObjectSchema,
  TrackObjectSchema,
  AudioFeaturesObjectSchema,
} from './generated/spotify/schemas.js'

// ---------------------------------------------------------------------------
// Type machinery
// ---------------------------------------------------------------------------

type IsAny<T> = 0 extends 1 & T ? true : false
type IsUnknownExact<T> = IsAny<T> extends true ? false : unknown extends T ? true : false
// Real declared keys only: drop the wide string/number index signature from passthrough.
type NamedKeys<T> = {
  [K in keyof T]: string extends K ? never : number extends K ? never : K
}[keyof T]
type DeepHasUnknown<T> =
  IsUnknownExact<T> extends true
    ? true
    : IsAny<T> extends true
      ? false
      : T extends (...args: never[]) => unknown
        ? false
        : T extends readonly (infer E)[]
          ? DeepHasUnknown<E>
          : T extends object
            ? true extends { [K in NamedKeys<T>]-?: DeepHasUnknown<T[K]> }[NamedKeys<T>]
              ? true
              : false
            : false

// If T has no unknown in named fields, this is `true`.
// If T leaks unknown in a named field, this becomes `{ __UNKNOWN_LEAKED__: T }`, so `= true` fails to compile.
type AssertNoUnknown<T> = [DeepHasUnknown<T>] extends [false] ? true : { __UNKNOWN_LEAKED__: T }

// ---------------------------------------------------------------------------
// #383: canada_holidays cyclic schemas
//
// HolidaySchema and ProvinceSchema are annotated as `z.ZodType<Holiday>` and
// `z.ZodType<Province>` with z.lazy() to handle the mutual cycle. Before #383,
// a bare `z.lazy(() => z.object(...)): z.ZodType` collapsed z.infer<> to unknown.
// After #383 the type parameter is explicit, so z.infer<> resolves to the full
// interface.
//
// Because Holiday <-> Province form a mutual cycle, TypeScript 6's conditional type
// evaluator returns `boolean` for DeepHasUnknown<Holiday>, causing a false positive
// with AssertNoUnknown. We handle this with two complementary checks:
// (a) AssertNoUnknown over Pick<> of each type's non-cyclic leaf fields (exercises the
//     full machinery and confirms individual field types are concrete).
// (b) A direct IsUnknownExact assertion proving z.infer<typeof HolidaySchema> is NOT
//     the `unknown` top-level type, which is exactly the regression shape for #383.
//
// RootSchema and ErrorSchema are non-cyclic, so they use AssertNoUnknown directly.
// ---------------------------------------------------------------------------

// (a) Non-cyclic leaf fields of Holiday and Province
const _holidayLeafFields: AssertNoUnknown<
  Pick<Holiday, 'date' | 'federal' | 'id' | 'nameEn' | 'nameFr' | 'observedDate'>
> = true
const _provinceLeafFields: AssertNoUnknown<
  Pick<Province, 'id' | 'nameEn' | 'nameFr' | 'sourceEn' | 'sourceLink'>
> = true

// (b) Top-level: z.infer<typeof HolidaySchema> must NOT be `unknown` (the #383 regression shape).
// HolidaySchema: z.ZodType<Holiday> -- z.infer<> gives Holiday, not unknown.
type _HolidayInferredIsNotUnknown =
  IsUnknownExact<z.infer<typeof HolidaySchema>> extends false ? true : never
type _ProvinceInferredIsNotUnknown =
  IsUnknownExact<z.infer<typeof ProvinceSchema>> extends false ? true : never
const _holidayInferNotUnknown: _HolidayInferredIsNotUnknown = true
const _provinceInferNotUnknown: _ProvinceInferredIsNotUnknown = true

// Non-cyclic synthesized response schemas: full AssertNoUnknown applies.
const _rootInferred: AssertNoUnknown<z.infer<typeof RootSchema>> = true
const _errorInferred: AssertNoUnknown<z.infer<typeof ErrorSchema>> = true

// ---------------------------------------------------------------------------
// #390: resend nullable arrays and object-null nullable fields
//
// EmailSchema.bcc / cc / reply_to were previously emitted as nullable arrays
// that collapsed to `unknown | null` in z.infer<>. After the fix they are
// `z.array(z.string()).optional()`, which infers to `string[] | undefined`.
// DomainSchema and DomainRecordSchema cover the object-null nullable case:
// fields like `status` and `ttl` are nullable primitives (string | null), not unknown.
// ---------------------------------------------------------------------------

const _emailModel: AssertNoUnknown<Email> = true
const _emailInferred: AssertNoUnknown<z.infer<typeof EmailSchema>> = true
const _attachmentModel: AssertNoUnknown<Attachment> = true
const _attachmentInferred: AssertNoUnknown<z.infer<typeof AttachmentSchema>> = true
const _domainModel: AssertNoUnknown<Domain> = true
const _domainInferred: AssertNoUnknown<z.infer<typeof DomainSchema>> = true
const _domainRecordModel: AssertNoUnknown<DomainRecord> = true
const _domainRecordInferred: AssertNoUnknown<z.infer<typeof DomainRecordSchema>> = true

// ---------------------------------------------------------------------------
// Breadth: spotify (no z.unknown() fields anywhere in this example)
//
// Covers unions (PlaylistTrackObjectSchema uses union([TrackObjectSchema, EpisodeObjectSchema])),
// nested objects (ArtistObject has followers and images arrays), and numeric primitives
// (AudioFeaturesObject). All three have rich schemas with zero z.unknown() usage.
// ---------------------------------------------------------------------------

const _artistModel: AssertNoUnknown<ArtistObject> = true
const _artistInferred: AssertNoUnknown<z.infer<typeof ArtistObjectSchema>> = true
const _trackModel: AssertNoUnknown<TrackObject> = true
const _trackInferred: AssertNoUnknown<z.infer<typeof TrackObjectSchema>> = true
const _audioFeaturesModel: AssertNoUnknown<AudioFeaturesObject> = true
const _audioFeaturesInferred: AssertNoUnknown<z.infer<typeof AudioFeaturesObjectSchema>> = true

// ---------------------------------------------------------------------------
// Self-tests: prove DeepHasUnknown actually fires
//
// Rule: @ts-expect-error suppresses the compile error. If the assertion does NOT
// produce an error (i.e. DeepHasUnknown returned false when it should return true),
// TypeScript reports "Unused '@ts-expect-error' directive" and typecheck fails.
// That is the guard that makes these tests non-vacuous.
// ---------------------------------------------------------------------------

// 1. Named field containing unknown nested in an array: must be flagged.
//    DeepHasUnknown<_L1>: _L1.a = {b: unknown[]} -> .b = unknown[] -> element = unknown -> true.
interface _L1 {
  a: { b: unknown[] }
}
// @ts-expect-error - _L1 has unknown nested in a named array property
const _teeth1: AssertNoUnknown<_L1> = true

// 2. Unknown inside a union member of a named field: must be flagged.
//    DeepHasUnknown<{u: string | {deep: unknown}}>: distributes to false | true = boolean.
//    [boolean] extends [false] = false, so AssertNoUnknown = { __UNKNOWN_LEAKED__ }.
//    The @ts-expect-error is satisfied; if the detector ever stopped flagging unknowns
//    in unions, TypeScript would instead return `true` here and the directive would be
//    unused, failing the typecheck.
// @ts-expect-error - the union member { deep: unknown } leaks unknown
const _teeth2: AssertNoUnknown<{ u: string | { deep: unknown } }> = true

// 3. Whole-type unknown: must be flagged. This is exactly the pre-#383 shape
//    where z.infer<z.ZodType> without a type parameter collapsed to unknown.
// @ts-expect-error - the top-level type IS unknown
const _teeth3: AssertNoUnknown<unknown> = true

// 4. Passthrough-like type with wide index signature: must PASS without @ts-expect-error.
//    NamedKeys<_Loose> = only 'a' (the string index signature is excluded), so
//    DeepHasUnknown checks only `a: string` which is not unknown.
//    This proves the passthrough catchall is correctly ignored: without NamedKeys the
//    index `[k: string]: unknown` would be checked and every generated schema would fail.
type _Loose = { a: string } & { [k: string]: unknown }
const _teeth4: AssertNoUnknown<_Loose> = true
