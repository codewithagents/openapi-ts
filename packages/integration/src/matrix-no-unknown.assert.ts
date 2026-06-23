// Compile-time SECONDARY belt: z.infer<> of every matrix schema must NOT be the
// `unknown` top type. This catches the #383 regression shape where z.lazy without an
// explicit type parameter collapsed z.infer<> to `unknown`.
//
// Detection methodology for this matrix:
//
// PRIMARY (runtime, recursion-safe): source-text scan in matrix-no-zunknown.test.ts.
//   Reads generated-matrix/models.ts, service.ts, schemas.ts, and router.ts as text
//   and asserts no ` unknown` token and no `z.unknown()`. Because every construct in
//   matrix.json is concretely representable, any occurrence is a real bug.
//
// SECONDARY (compile-time, this file): IsUnknownExact<z.infer<typeof XSchema>> for
//   every exported schema. This is a single-level "is the whole type exactly unknown?"
//   check -- it does not recurse into fields. The deep recursive DeepHasUnknown was
//   dropped: the matrix has 130+ $refs producing densely cross-referenced intersection
//   and union types where TypeScript's conditional type evaluator defers evaluation to
//   `boolean`, producing false positives for perfectly-typed schemas.
//
// KEY RESULT: 0 red cells. All generated types are concretely typed; the source scan
//   confirms no `unknown` token appears in any generated output.
//
// Note: the Teeth self-tests below prove the IsUnknownExact detector has real teeth:
//   whole-type `unknown` fails; a concrete type passes; `any` passes.

import type { z } from 'zod'

// Schemas
import {
  MxStringSchema,
  MxEmailSchema,
  MxUuidSchema,
  MxDateTimeSchema,
  MxDateSchema,
  MxUriSchema,
  MxIntegerSchema,
  MxInt32Schema,
  MxInt64Schema,
  MxFloatSchema,
  MxDoubleSchema,
  MxBooleanSchema,
  MxStringEnumSchema,
  MxIntegerEnumSchema,
  MxStringConstSchema,
  MxNumberConstSchema,
  MxArrayOfPrimitiveSchema,
  MxArrayOfRefSchema,
  MxArrayOfArraySchema,
  MxTupleSchema,
  MxTupleWithRestSchema,
  MxObjectSchema,
  MxRecordSchema,
  MxObjectWithBothSchema,
  MxNullableStringUnionSchema,
  MxNullableArrayUnionSchema,
  MxNullableObjectUnionSchema,
  MxNullableRecordUnionSchema,
  MxNullableRefUnionSchema,
  MxNullableStringLegacySchema,
  MxNullableArrayLegacySchema,
  MxNullableObjectLegacySchema,
  MxNullableRecordLegacySchema,
  MxNullableRefLegacySchema,
  MxBase1Schema,
  MxBase2Schema,
  MxAllOfRefsSchema,
  MxAllOfWithSiblingPropsSchema,
  MxAnyOfRefsSchema,
  MxAnyOfWithNullSchema,
  MxDiscBaseSchema,
  MxVariantASchema,
  MxVariantBSchema,
  MxOneOfRefsSchema,
  MxOneOfDiscriminatorSchema,
  MxTreeNodeSchema,
  MxMutualASchema,
  MxMutualBSchema,
  MxCycleCompASchema,
  MxCycleCompBSchema,
  MxMultiTypeStringIntSchema,
  MxMultiTypeStringIntNullSchema,
  MxMultiTypeObjectStringNullSchema,
  MxAllPrimitivesContainerSchema,
  MxFormatsContainerSchema,
  MxEnumConstContainerSchema,
  MxArraysContainerSchema,
  MxObjectsContainerSchema,
  MxNullableContainerSchema,
  MxCompositionContainerSchema,
  MxCyclicContainerSchema,
  MxMultiTypeContainerSchema,
} from '../generated-matrix/schemas.js'

// ---------------------------------------------------------------------------
// Type machinery
// ---------------------------------------------------------------------------

type IsAny<T> = 0 extends 1 & T ? true : false

// IsUnknownExact<T> returns true ONLY when T is exactly the `unknown` top type.
// It correctly returns false for `any` (IsAny guard), concrete types, and
// intersections/unions that do not evaluate to the bare unknown type.
type IsUnknownExact<T> = IsAny<T> extends true ? false : unknown extends T ? true : false

// AssertNotWholeUnknown<T>: passes when z.infer<> is NOT the bare `unknown` type.
// Fails (compile error) only when the entire inferred type IS `unknown`.
// This directly pins the #383 regression shape for every schema.
type AssertNotWholeUnknown<T> = IsUnknownExact<T> extends true ? never : true

// ---------------------------------------------------------------------------
// Teeth self-tests: prove the detector fires on real cases
// ---------------------------------------------------------------------------

// Tooth 1: IsUnknownExact<unknown> must be true (the whole type is unknown).
type _Tooth1Pass = [IsUnknownExact<unknown>] extends [true] ? true : never
const _tooth1: _Tooth1Pass = true

// Tooth 2: IsUnknownExact<string> must be false (concrete type).
type _Tooth2Pass = [IsUnknownExact<string>] extends [false] ? true : never
const _tooth2: _Tooth2Pass = true

// Tooth 3: IsUnknownExact<any> must be false (IsAny guard prevents false positive).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type _Tooth3Pass = [IsUnknownExact<any>] extends [false] ? true : never
const _tooth3: _Tooth3Pass = true

// Tooth 4: IsUnknownExact<string | null> must be false (concrete union).
type _Tooth4Pass = [IsUnknownExact<string | null>] extends [false] ? true : never
const _tooth4: _Tooth4Pass = true

// ---------------------------------------------------------------------------
// SECTION: z.infer<> over every exported matrix schema
// (None should evaluate to the bare `unknown` top type)
// ---------------------------------------------------------------------------

// Primitives
const _si_str: AssertNotWholeUnknown<z.infer<typeof MxStringSchema>> = true
const _si_email: AssertNotWholeUnknown<z.infer<typeof MxEmailSchema>> = true
const _si_uuid: AssertNotWholeUnknown<z.infer<typeof MxUuidSchema>> = true
const _si_dateTime: AssertNotWholeUnknown<z.infer<typeof MxDateTimeSchema>> = true
const _si_date: AssertNotWholeUnknown<z.infer<typeof MxDateSchema>> = true
const _si_uri: AssertNotWholeUnknown<z.infer<typeof MxUriSchema>> = true
const _si_int: AssertNotWholeUnknown<z.infer<typeof MxIntegerSchema>> = true
const _si_int32: AssertNotWholeUnknown<z.infer<typeof MxInt32Schema>> = true
const _si_int64: AssertNotWholeUnknown<z.infer<typeof MxInt64Schema>> = true
const _si_float: AssertNotWholeUnknown<z.infer<typeof MxFloatSchema>> = true
const _si_double: AssertNotWholeUnknown<z.infer<typeof MxDoubleSchema>> = true
const _si_bool: AssertNotWholeUnknown<z.infer<typeof MxBooleanSchema>> = true

// Enums and consts
const _si_strEnum: AssertNotWholeUnknown<z.infer<typeof MxStringEnumSchema>> = true
const _si_intEnum: AssertNotWholeUnknown<z.infer<typeof MxIntegerEnumSchema>> = true
const _si_strConst: AssertNotWholeUnknown<z.infer<typeof MxStringConstSchema>> = true
const _si_numConst: AssertNotWholeUnknown<z.infer<typeof MxNumberConstSchema>> = true

// Arrays and tuples
const _si_arrPrim: AssertNotWholeUnknown<z.infer<typeof MxArrayOfPrimitiveSchema>> = true
const _si_arrRef: AssertNotWholeUnknown<z.infer<typeof MxArrayOfRefSchema>> = true
const _si_arrArr: AssertNotWholeUnknown<z.infer<typeof MxArrayOfArraySchema>> = true
const _si_tuple: AssertNotWholeUnknown<z.infer<typeof MxTupleSchema>> = true
const _si_tupleRest: AssertNotWholeUnknown<z.infer<typeof MxTupleWithRestSchema>> = true

// Objects
const _si_obj: AssertNotWholeUnknown<z.infer<typeof MxObjectSchema>> = true
const _si_record: AssertNotWholeUnknown<z.infer<typeof MxRecordSchema>> = true
const _si_objBoth: AssertNotWholeUnknown<z.infer<typeof MxObjectWithBothSchema>> = true

// Nullable (3.1 union form)
const _si_nullStrUnion: AssertNotWholeUnknown<z.infer<typeof MxNullableStringUnionSchema>> = true
const _si_nullArrUnion: AssertNotWholeUnknown<z.infer<typeof MxNullableArrayUnionSchema>> = true
const _si_nullObjUnion: AssertNotWholeUnknown<z.infer<typeof MxNullableObjectUnionSchema>> = true
const _si_nullRecUnion: AssertNotWholeUnknown<z.infer<typeof MxNullableRecordUnionSchema>> = true
const _si_nullRefUnion: AssertNotWholeUnknown<z.infer<typeof MxNullableRefUnionSchema>> = true

// Nullable (3.0 nullable:true form)
const _si_nullStrLeg: AssertNotWholeUnknown<z.infer<typeof MxNullableStringLegacySchema>> = true
const _si_nullArrLeg: AssertNotWholeUnknown<z.infer<typeof MxNullableArrayLegacySchema>> = true
const _si_nullObjLeg: AssertNotWholeUnknown<z.infer<typeof MxNullableObjectLegacySchema>> = true
const _si_nullRecLeg: AssertNotWholeUnknown<z.infer<typeof MxNullableRecordLegacySchema>> = true
const _si_nullRefLeg: AssertNotWholeUnknown<z.infer<typeof MxNullableRefLegacySchema>> = true

// Composition
const _si_base1: AssertNotWholeUnknown<z.infer<typeof MxBase1Schema>> = true
const _si_base2: AssertNotWholeUnknown<z.infer<typeof MxBase2Schema>> = true
const _si_allOfRefs: AssertNotWholeUnknown<z.infer<typeof MxAllOfRefsSchema>> = true
const _si_allOfSib: AssertNotWholeUnknown<z.infer<typeof MxAllOfWithSiblingPropsSchema>> = true
const _si_anyOfRefs: AssertNotWholeUnknown<z.infer<typeof MxAnyOfRefsSchema>> = true
const _si_anyOfNull: AssertNotWholeUnknown<z.infer<typeof MxAnyOfWithNullSchema>> = true
const _si_discBase: AssertNotWholeUnknown<z.infer<typeof MxDiscBaseSchema>> = true
const _si_variantA: AssertNotWholeUnknown<z.infer<typeof MxVariantASchema>> = true
const _si_variantB: AssertNotWholeUnknown<z.infer<typeof MxVariantBSchema>> = true
const _si_oneOfRefs: AssertNotWholeUnknown<z.infer<typeof MxOneOfRefsSchema>> = true
const _si_oneOfDisc: AssertNotWholeUnknown<z.infer<typeof MxOneOfDiscriminatorSchema>> = true

// Recursive/cyclic schemas: IsUnknownExact is single-level, no recursion false-positive risk.
// These assert that the WHOLE inferred type is not `unknown` -- the #383 regression guard.
const _si_treeNode: AssertNotWholeUnknown<z.infer<typeof MxTreeNodeSchema>> = true
const _si_mutualA: AssertNotWholeUnknown<z.infer<typeof MxMutualASchema>> = true
const _si_mutualB: AssertNotWholeUnknown<z.infer<typeof MxMutualBSchema>> = true
const _si_cycleA: AssertNotWholeUnknown<z.infer<typeof MxCycleCompASchema>> = true
const _si_cycleB: AssertNotWholeUnknown<z.infer<typeof MxCycleCompBSchema>> = true

// Multi-type unions
const _si_strInt: AssertNotWholeUnknown<z.infer<typeof MxMultiTypeStringIntSchema>> = true
const _si_strIntNull: AssertNotWholeUnknown<z.infer<typeof MxMultiTypeStringIntNullSchema>> = true
const _si_objStrNull: AssertNotWholeUnknown<z.infer<typeof MxMultiTypeObjectStringNullSchema>> =
  true

// Container schemas
const _si_allPrimCont: AssertNotWholeUnknown<z.infer<typeof MxAllPrimitivesContainerSchema>> = true
const _si_formatsCont: AssertNotWholeUnknown<z.infer<typeof MxFormatsContainerSchema>> = true
const _si_enumConstCont: AssertNotWholeUnknown<z.infer<typeof MxEnumConstContainerSchema>> = true
const _si_arrsCont: AssertNotWholeUnknown<z.infer<typeof MxArraysContainerSchema>> = true
const _si_objsCont: AssertNotWholeUnknown<z.infer<typeof MxObjectsContainerSchema>> = true
const _si_nullCont: AssertNotWholeUnknown<z.infer<typeof MxNullableContainerSchema>> = true
const _si_compCont: AssertNotWholeUnknown<z.infer<typeof MxCompositionContainerSchema>> = true
const _si_cyclicCont: AssertNotWholeUnknown<z.infer<typeof MxCyclicContainerSchema>> = true
const _si_multiTypeCont: AssertNotWholeUnknown<z.infer<typeof MxMultiTypeContainerSchema>> = true
