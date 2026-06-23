// This file is auto-generated. Do not edit manually.
// Fastify-aligned type aliases derived from Zod schemas via z.infer (= z.output).
// These are post-validation, post-transform types: they reflect the shape after Zod
// has parsed and transformed the value, which can differ from models.ts when a schema
// uses .transform(), .default(), or coercion. Import from here in your Fastify service.

import { z } from 'zod'
import {
  MxAllOfRefsSchema,
  MxAllOfWithSiblingPropsSchema,
  MxAllPrimitivesContainerSchema,
  MxAnyOfRefsSchema,
  MxAnyOfWithNullSchema,
  MxArrayOfArraySchema,
  MxArrayOfPrimitiveSchema,
  MxArrayOfRefSchema,
  MxArraysContainerSchema,
  MxBase1Schema,
  MxBase2Schema,
  MxBooleanSchema,
  MxCompositionContainerSchema,
  MxCycleCompASchema,
  MxCycleCompBSchema,
  MxCyclicContainerSchema,
  MxDateSchema,
  MxDateTimeSchema,
  MxDiscBaseSchema,
  MxDoubleSchema,
  MxEmailSchema,
  MxEnumConstContainerSchema,
  MxFloatSchema,
  MxFormatsContainerSchema,
  MxInt32Schema,
  MxInt64Schema,
  MxIntegerEnumSchema,
  MxIntegerSchema,
  MxMultiTypeContainerSchema,
  MxMultiTypeObjectStringNullSchema,
  MxMultiTypeStringIntNullSchema,
  MxMultiTypeStringIntSchema,
  MxMutualASchema,
  MxMutualBSchema,
  MxNullableArrayLegacySchema,
  MxNullableArrayUnionSchema,
  MxNullableContainerSchema,
  MxNullableObjectLegacySchema,
  MxNullableObjectUnionSchema,
  MxNullableRecordLegacySchema,
  MxNullableRecordUnionSchema,
  MxNullableRefLegacySchema,
  MxNullableRefUnionSchema,
  MxNullableStringLegacySchema,
  MxNullableStringUnionSchema,
  MxNumberConstSchema,
  MxObjectSchema,
  MxObjectWithBothSchema,
  MxObjectsContainerSchema,
  MxOneOfDiscriminatorSchema,
  MxOneOfRefsSchema,
  MxRecordSchema,
  MxStringConstSchema,
  MxStringEnumSchema,
  MxStringSchema,
  MxTreeNodeSchema,
  MxTupleSchema,
  MxTupleWithRestSchema,
  MxUriSchema,
  MxUuidSchema,
  MxVariantASchema,
  MxVariantBSchema,
} from './schemas.js'

export type MxAllOfRefs = z.infer<typeof MxAllOfRefsSchema>
export type MxAllOfWithSiblingProps = z.infer<typeof MxAllOfWithSiblingPropsSchema>
export type MxAllPrimitivesContainer = z.infer<typeof MxAllPrimitivesContainerSchema>
export type MxAnyOfRefs = z.infer<typeof MxAnyOfRefsSchema>
export type MxAnyOfWithNull = z.infer<typeof MxAnyOfWithNullSchema>
export type MxArrayOfArray = z.infer<typeof MxArrayOfArraySchema>
export type MxArrayOfPrimitive = z.infer<typeof MxArrayOfPrimitiveSchema>
export type MxArrayOfRef = z.infer<typeof MxArrayOfRefSchema>
export type MxArraysContainer = z.infer<typeof MxArraysContainerSchema>
export type MxBase1 = z.infer<typeof MxBase1Schema>
export type MxBase2 = z.infer<typeof MxBase2Schema>
export type MxBoolean = z.infer<typeof MxBooleanSchema>
export type MxCompositionContainer = z.infer<typeof MxCompositionContainerSchema>
export type MxCycleCompA = z.infer<typeof MxCycleCompASchema>
export type MxCycleCompB = z.infer<typeof MxCycleCompBSchema>
export type MxCyclicContainer = z.infer<typeof MxCyclicContainerSchema>
export type MxDate = z.infer<typeof MxDateSchema>
export type MxDateTime = z.infer<typeof MxDateTimeSchema>
export type MxDiscBase = z.infer<typeof MxDiscBaseSchema>
export type MxDouble = z.infer<typeof MxDoubleSchema>
export type MxEmail = z.infer<typeof MxEmailSchema>
export type MxEnumConstContainer = z.infer<typeof MxEnumConstContainerSchema>
export type MxFloat = z.infer<typeof MxFloatSchema>
export type MxFormatsContainer = z.infer<typeof MxFormatsContainerSchema>
export type MxInt32 = z.infer<typeof MxInt32Schema>
export type MxInt64 = z.infer<typeof MxInt64Schema>
export type MxIntegerEnum = z.infer<typeof MxIntegerEnumSchema>
export type MxInteger = z.infer<typeof MxIntegerSchema>
export type MxMultiTypeContainer = z.infer<typeof MxMultiTypeContainerSchema>
export type MxMultiTypeObjectStringNull = z.infer<typeof MxMultiTypeObjectStringNullSchema>
export type MxMultiTypeStringIntNull = z.infer<typeof MxMultiTypeStringIntNullSchema>
export type MxMultiTypeStringInt = z.infer<typeof MxMultiTypeStringIntSchema>
export type MxMutualA = z.infer<typeof MxMutualASchema>
export type MxMutualB = z.infer<typeof MxMutualBSchema>
export type MxNullableArrayLegacy = z.infer<typeof MxNullableArrayLegacySchema>
export type MxNullableArrayUnion = z.infer<typeof MxNullableArrayUnionSchema>
export type MxNullableContainer = z.infer<typeof MxNullableContainerSchema>
export type MxNullableObjectLegacy = z.infer<typeof MxNullableObjectLegacySchema>
export type MxNullableObjectUnion = z.infer<typeof MxNullableObjectUnionSchema>
export type MxNullableRecordLegacy = z.infer<typeof MxNullableRecordLegacySchema>
export type MxNullableRecordUnion = z.infer<typeof MxNullableRecordUnionSchema>
export type MxNullableRefLegacy = z.infer<typeof MxNullableRefLegacySchema>
export type MxNullableRefUnion = z.infer<typeof MxNullableRefUnionSchema>
export type MxNullableStringLegacy = z.infer<typeof MxNullableStringLegacySchema>
export type MxNullableStringUnion = z.infer<typeof MxNullableStringUnionSchema>
export type MxNumberConst = z.infer<typeof MxNumberConstSchema>
export type MxObject = z.infer<typeof MxObjectSchema>
export type MxObjectWithBoth = z.infer<typeof MxObjectWithBothSchema>
export type MxObjectsContainer = z.infer<typeof MxObjectsContainerSchema>
export type MxOneOfDiscriminator = z.infer<typeof MxOneOfDiscriminatorSchema>
export type MxOneOfRefs = z.infer<typeof MxOneOfRefsSchema>
export type MxRecord = z.infer<typeof MxRecordSchema>
export type MxStringConst = z.infer<typeof MxStringConstSchema>
export type MxStringEnum = z.infer<typeof MxStringEnumSchema>
export type MxString = z.infer<typeof MxStringSchema>
export type MxTreeNode = z.infer<typeof MxTreeNodeSchema>
export type MxTuple = z.infer<typeof MxTupleSchema>
export type MxTupleWithRest = z.infer<typeof MxTupleWithRestSchema>
export type MxUri = z.infer<typeof MxUriSchema>
export type MxUuid = z.infer<typeof MxUuidSchema>
export type MxVariantA = z.infer<typeof MxVariantASchema>
export type MxVariantB = z.infer<typeof MxVariantBSchema>
