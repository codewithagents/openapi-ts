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
import type { Holiday, Province } from './models.js'

export const ErrorSchema = z.object({
  message: z.string().optional(),
  status: z.number().min(100).max(599).optional(),
  timestamp: z.iso.datetime().optional()
}).passthrough()

export const HolidaySchema = z.lazy(() => z.object({
  date: z.iso.date(),
  federal: z.union([z.literal(1), z.literal(0)]),
  id: z.number().min(1).max(32),
  nameEn: z.string(),
  nameFr: z.string(),
  observedDate: z.iso.date(),
  optional: z.union([z.literal(1)]).optional(),
  provinces: z.array(ProvinceSchema).optional()
}).passthrough()) as z.ZodType<Holiday>

export const ProvinceSchema = z.lazy(() => z.object({
  id: z.enum(["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"]),
  nameEn: z.string(),
  nameFr: z.string(),
  nextHoliday: HolidaySchema.optional(),
  optional: z.union([z.literal(1)]).optional(),
  provinces: z.array(HolidaySchema).optional(),
  sourceEn: z.string(),
  sourceLink: z.string().regex(new RegExp("https+"))
}).passthrough()) as z.ZodType<Province>

// Synthesized schemas for inline JSON responses (operationId-based naming).
// These are used by openapi-server to wire schema.response for Fastify routes.
// Add refinements here as needed; the generator will not overwrite this file.

export const RootSchema = z.object({
  _links: z.object({
  holidays: z.object({
  href: z.string().optional()
}).passthrough().optional(),
  provinces: z.object({
  href: z.string().optional()
}).passthrough().optional(),
  self: z.object({
  href: z.string().optional()
}).passthrough().optional(),
  spec: z.object({
  href: z.string().optional()
}).passthrough().optional()
}).passthrough().optional(),
  message: z.string().optional()
}).passthrough()

export const HolidaysSchema = z.object({
  holidays: z.array(HolidaySchema).optional()
}).passthrough()

export const Holiday_2Schema = z.object({
  holiday: HolidaySchema.optional()
}).passthrough()

export const ProvincesSchema = z.object({
  provinces: z.array(ProvinceSchema).optional()
}).passthrough()

export const Province_2Schema = z.object({
  province: ProvinceSchema.optional()
}).passthrough()
