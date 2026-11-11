import { z } from 'zod'

import { zPostApiAuthLoginBody, zPostApiAuthSignupBody } from '@/services/generated/zod.gen'
import '@/shared/utils/zod-messages'

// The form schemas extend the generated request schemas, so the limits (password length, email
// size) come from the server's contract and are never copied. The generated email carries no
// format on one server (Bun) and a regex on another (Python), each with a default message, so
// the form runs both checks and words every failure itself.
const generatedEmail = zPostApiAuthLoginBody.shape.email
const formatEmail = z.email()
const email = z.string().superRefine((value, ctx) => {
  if (!generatedEmail.safeParse(value).success || !formatEmail.safeParse(value).success) {
    ctx.addIssue({ code: 'custom', message: 'Enter a valid email address' })
  }
})

export const signInSchema = zPostApiAuthLoginBody.extend({
  email,
  // Where to go after signing in: validated again on the server (safeNextPath).
  next: z.string().optional(),
})

export const signUpSchema = zPostApiAuthSignupBody
  .extend({ email, confirm: z.string(), next: z.string().optional() })
  .refine((value) => value.password === value.confirm, {
    path: ['confirm'],
    error: 'Passwords do not match',
  })

export type SignInInput = z.input<typeof signInSchema>
export type SignUpInput = z.input<typeof signUpSchema>
