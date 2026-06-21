// Bootstrapped by openapi-zod-ts - this file is yours.
// Add error messages, refinements, and business rules freely.
// Re-running the generator will NOT overwrite this file.
// Requires zod v4.

import { z } from 'zod'

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
})

export const LoginRequestSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
})

export const LoginResponseSchema = z.object({
  token: z.string(),
  user: UserSchema,
})

export const ContactResponseSchema = z.object({
  accepted: z.literal(true),
  method: z.string(),
})

// ContactRequest carries a conditional cross-field rule: the contact field named by
// `method` is required. When method === 'email' the email field must be present; when
// method === 'phone' the phone field must be present.
export const ContactRequestSchema = z
  .object({
    method: z.enum(['email', 'phone']),
    email: z.string().optional(),
    phone: z.string().optional(),
    message: z.string().min(1, 'Message is required'),
  })
  // CRAP is inflated by zero inline-arrow coverage; the rule is exercised by the
  // /contact cross-field tests (valid 200, missing-field 400).
  // fallow-ignore-next-line complexity
  .superRefine((data, ctx) => {
    if (data.method === 'email' && !data.email?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['email'],
        message: 'Email is required when method is email',
      })
    }
    if (data.method === 'phone' && !data.phone?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['phone'],
        message: 'Phone is required when method is phone',
      })
    }
  })
