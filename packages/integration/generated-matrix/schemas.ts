// Bootstrapped by openapi-zod-ts - this file is yours.
// Add error messages, refinements, and business rules freely.
// Re-running the generator will NOT overwrite this file.
// Requires zod v4 (z.record takes two args, z.lazy for circular refs).
//
// Object schemas include .passthrough() so new optional server fields are
// preserved when the API evolves - without breaking existing consumers.
// Schemas with additionalProperties: false use .strict() instead.
//
// Form wizard pattern: extend API schemas for UI-only fields.
// The generated client strips unknown keys before sending, so extra form
// fields (step, confirmCheckbox, etc.) are never leaked to the backend:
//
//   export const CreateOrderFormSchema = CreateOrderSchema.extend({
//     step: z.number(),
//     confirmTerms: z.boolean(),
//   })
//
// Use CreateOrderFormSchema for React Hook Form validation, then pass the
// full form values to the generated client - it strips to API fields only.

import { z } from 'zod'
import type { MxTreeNode, MxMutualA, MxMutualB, MxCycleCompA, MxCycleCompB } from './models.js'

export const MxStringSchema = z.string()

export const MxEmailSchema = z.email()

export const MxUuidSchema = z.uuid()

export const MxDateTimeSchema = z.iso.datetime()

export const MxDateSchema = z.iso.date()

export const MxUriSchema = z.string()

export const MxIntegerSchema = z.number()

export const MxInt32Schema = z.number()

export const MxInt64Schema = z.number()

export const MxFloatSchema = z.number()

export const MxDoubleSchema = z.number()

export const MxBooleanSchema = z.boolean()

export const MxStringEnumSchema = z.enum(['alpha', 'beta', 'gamma'])

export const MxIntegerEnumSchema = z.union([z.literal(1), z.literal(2), z.literal(3)])

export const MxStringConstSchema = z.literal('fixed-value')

export const MxNumberConstSchema = z.literal(42)

export const MxArrayOfPrimitiveSchema = z.array(z.string())

export const MxArrayOfArraySchema = z.array(z.array(z.number()))

export const MxTupleSchema = z
  .object({
    pair: z.tuple([z.string(), z.number(), z.boolean()]),
  })
  .passthrough()

export const MxTupleWithRestSchema = z
  .object({
    tagged: z.tuple([z.string(), z.number()]).rest(z.string()),
  })
  .passthrough()

export const MxObjectSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    count: z.number().optional(),
  })
  .passthrough()

export const MxRecordSchema = z.record(z.string(), z.string())

export const MxObjectWithBothSchema = z
  .object({
    label: z.string(),
    count: z.number().optional(),
  })
  .passthrough()

export const MxNullableStringUnionSchema = z.string().nullable()

export const MxNullableArrayUnionSchema = z.union([z.array(z.string()), z.null()])

export const MxNullableStringLegacySchema = z.string().nullable()

export const MxNullableArrayLegacySchema = z.union([z.array(z.string()), z.null()])

export const MxNullableObjectLegacySchema = z.union([
  z
    .object({
      val: z.string(),
    })
    .passthrough(),
  z.null(),
])

export const MxNullableRecordLegacySchema = z.union([z.record(z.string(), z.number()), z.null()])

export const MxBase1Schema = z
  .object({
    field1: z.string(),
  })
  .passthrough()

export const MxBase2Schema = z
  .object({
    field2: z.number(),
  })
  .passthrough()

export const MxDiscBaseSchema = z
  .object({
    kind: z.string(),
  })
  .passthrough()

export const MxTreeNodeSchema: z.ZodType<MxTreeNode> = z.lazy(() =>
  z
    .object({
      value: z.string(),
      left: MxTreeNodeSchema.optional(),
      right: MxTreeNodeSchema.optional(),
    })
    .passthrough()
)

export const MxMultiTypeStringIntSchema = z.union([z.string(), z.number()])

export const MxMultiTypeStringIntNullSchema = z.union([z.string(), z.number(), z.null()])

export const MxMultiTypeObjectStringNullSchema = z.union([
  z
    .object({
      label: z.string(),
    })
    .passthrough(),
  z.string(),
  z.null(),
])

export const MxFormatsContainerSchema = z
  .object({
    email: z.email(),
    uuid: z.uuid(),
    dateTime: z.iso.datetime(),
    date: z.iso.date(),
    uri: z.string(),
  })
  .passthrough()

export const MxAllPrimitivesContainerSchema = z
  .object({
    str: MxStringSchema,
    email: MxEmailSchema,
    uuid: MxUuidSchema,
    dateTime: MxDateTimeSchema,
    date: MxDateSchema,
    uri: MxUriSchema,
    int: MxIntegerSchema,
    int32: MxInt32Schema,
    int64: MxInt64Schema,
    float: MxFloatSchema,
    double: MxDoubleSchema,
    bool: MxBooleanSchema,
  })
  .passthrough()

export const MxEnumConstContainerSchema = z
  .object({
    strEnum: MxStringEnumSchema,
    intEnum: MxIntegerEnumSchema,
    strConst: MxStringConstSchema,
    numConst: MxNumberConstSchema,
  })
  .passthrough()

export const MxArrayOfRefSchema = z.array(MxObjectSchema)

export const MxNullableObjectUnionSchema = z.union([MxObjectSchema, z.null()])

export const MxNullableRefUnionSchema = z.union([MxObjectSchema, z.null()])

export const MxNullableRefLegacySchema = z.union([MxObjectSchema, z.null()])

export const MxNullableRecordUnionSchema = z.union([MxRecordSchema, z.null()])

export const MxAllOfWithSiblingPropsSchema = MxBase1Schema.and(
  z
    .object({
      extra: z.boolean(),
    })
    .passthrough()
)

export const MxAnyOfWithNullSchema = z.union([MxBase1Schema, z.null()])

export const MxAllOfRefsSchema = MxBase1Schema.and(MxBase2Schema)

export const MxAnyOfRefsSchema = z.union([MxBase1Schema, MxBase2Schema])

export const MxOneOfRefsSchema = z.union([MxBase1Schema, MxBase2Schema])

export const MxVariantASchema = MxDiscBaseSchema.and(
  z
    .object({
      aValue: z.string(),
    })
    .passthrough()
)

export const MxVariantBSchema = MxDiscBaseSchema.and(
  z
    .object({
      bCount: z.number(),
    })
    .passthrough()
)

export const MxMultiTypeContainerSchema = z
  .object({
    strOrInt: MxMultiTypeStringIntSchema,
    strOrIntOrNull: MxMultiTypeStringIntNullSchema,
    objOrStrOrNull: MxMultiTypeObjectStringNullSchema,
    inlineMultiType: z.union([z.boolean(), z.string()]).optional(),
  })
  .passthrough()

export const MxNullableContainerSchema = z
  .object({
    nullableStrUnion: MxNullableStringUnionSchema,
    nullableArrayUnion: MxNullableArrayUnionSchema.optional(),
    nullableObjectUnion: MxNullableObjectUnionSchema.optional(),
    nullableRecordUnion: MxNullableRecordUnionSchema.optional(),
    nullableRefUnion: MxNullableRefUnionSchema.optional(),
    nullableStrLegacy: MxNullableStringLegacySchema,
    nullableArrayLegacy: MxNullableArrayLegacySchema.optional(),
    nullableObjectLegacy: MxNullableObjectLegacySchema.optional(),
    nullableRecordLegacy: MxNullableRecordLegacySchema.optional(),
    nullableRefLegacy: MxNullableRefLegacySchema.optional(),
  })
  .passthrough()

export const MxObjectsContainerSchema = z
  .object({
    obj: MxObjectSchema,
    record: MxRecordSchema,
    objWithBoth: MxObjectWithBothSchema,
    recordOfEnum: z.record(z.string(), MxStringEnumSchema).optional(),
    recordOfObject: z.record(z.string(), MxObjectSchema).optional(),
    recordOfArray: z.record(z.string(), MxArrayOfPrimitiveSchema).optional(),
    recordOfAllOf: z.record(z.string(), MxAllOfRefsSchema).optional(),
  })
  .passthrough()

export const MxArraysContainerSchema = z
  .object({
    arrayOfPrimitive: MxArrayOfPrimitiveSchema,
    arrayOfRef: MxArrayOfRefSchema,
    arrayOfArray: MxArrayOfArraySchema,
    inlineArrayOfEnum: z.array(MxStringEnumSchema).optional(),
    inlineArrayOfObject: z.array(MxObjectSchema).optional(),
    inlineArrayOfNullable: z.array(MxNullableStringUnionSchema).optional(),
    inlineArrayOfAllOf: z.array(MxAllOfRefsSchema).optional(),
    inlineArrayOfAnyOf: z.array(MxAnyOfRefsSchema).optional(),
    inlineArrayOfOneOf: z.array(MxOneOfRefsSchema).optional(),
  })
  .passthrough()

export const MxOneOfDiscriminatorSchema = z.union([MxVariantASchema, MxVariantBSchema])

export const MxCompositionContainerSchema = z
  .object({
    allOfRefs: MxAllOfRefsSchema,
    allOfSiblings: MxAllOfWithSiblingPropsSchema,
    anyOfRefs: MxAnyOfRefsSchema,
    anyOfNull: MxAnyOfWithNullSchema,
    oneOfRefs: MxOneOfRefsSchema,
    oneOfDisc: MxOneOfDiscriminatorSchema,
    inlineAnyOf: z.union([MxStringSchema, MxIntegerSchema, z.null()]).optional(),
    inlineOneOf: z.union([MxObjectSchema, MxBase1Schema]).optional(),
    inlineAllOf: MxBase1Schema.and(MxBase2Schema)
      .and(
        z
          .object({
            extra: z.string().optional(),
          })
          .passthrough()
      )
      .optional(),
  })
  .passthrough()

export const MxMutualASchema: z.ZodType<MxMutualA> = z.lazy(() =>
  z
    .object({
      aName: z.string(),
      child: MxMutualBSchema.optional(),
    })
    .passthrough()
)

export const MxMutualBSchema: z.ZodType<MxMutualB> = z.lazy(() =>
  z
    .object({
      bName: z.string(),
      parent: MxMutualASchema.optional(),
    })
    .passthrough()
)

export const MxCycleCompASchema: z.ZodType<MxCycleCompA> = z.lazy(() =>
  MxBase1Schema.and(
    z
      .object({
        next: MxCycleCompBSchema.optional(),
      })
      .passthrough()
  )
)

export const MxCycleCompBSchema: z.ZodType<MxCycleCompB> = z.lazy(() =>
  z.union([MxCycleCompASchema, MxBase2Schema])
)

export const MxCyclicContainerSchema = z
  .object({
    treeNode: MxTreeNodeSchema,
    mutualA: MxMutualASchema,
    mutualB: MxMutualBSchema,
    cycleCompA: MxCycleCompASchema,
    cycleCompB: MxCycleCompBSchema,
  })
  .passthrough()
