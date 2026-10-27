import { z } from 'zod'

import '@/shared/lib/zod-messages'
import { zPostApiAuthLoginBody, zPostApiAuthRegisterBody } from '@/shared/api/generated/zod.gen'

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
  // Where to go after signing in: the sign-in widget and the form both pass it through safeNextPath.
  next: z.string().optional(),
})

export const signUpSchema = zPostApiAuthRegisterBody
  .extend({ email, confirm: z.string(), next: z.string().optional() })
  .refine((value) => value.password === value.confirm, {
    path: ['confirm'],
    error: 'Passwords do not match',
  })

export type SignInInput = z.input<typeof signInSchema>
export type SignUpInput = z.input<typeof signUpSchema>

// Copy for each outcome, keyed by the envelope's `code` (shared/api/call.ts has the defaults).
// A wrong password and an unknown email are the same 401, by design of the API.
export const SIGN_IN_COPY = {
  unauthenticated: 'Email or password is wrong.',
  forbidden: 'This account is blocked. Contact support.',
  rate_limited: 'Too many sign-in attempts. Wait a few minutes and try again.',
}

export const SIGN_UP_COPY = {
  conflict: 'That email is already registered. Sign in instead.',
  rate_limited: 'Too many sign-up attempts. Wait a few minutes and try again.',
}
