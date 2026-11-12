import { inject } from '@angular/core'
import { NonNullableFormBuilder } from '@angular/forms'

import { zCredentials, zOtpVerificationBody } from '@app/services/generated/zod.gen'
import { pick } from '@app/shared/utils/validation'
import { match } from '@app/shared/validators/match'
import { schemaValidator } from '@app/shared/validators/schema.validator'

// The auth forms, typed, with every rule taken from the generated zod request schema (the server's
// contract): the e-mail pattern, the password length, the six-digit code. Call them in an
// injection context (a component field).

export function loginForm() {
  return inject(NonNullableFormBuilder).group(
    { email: [''], password: [''] },
    { validators: schemaValidator(zCredentials) },
  )
}

// The confirm control is not in the contract; `match` compares it with the password.
export function signupForm() {
  return inject(NonNullableFormBuilder).group(
    { email: [''], password: [''], confirm: [''] },
    { validators: [schemaValidator(zCredentials), match('password', 'confirm')] },
  )
}

export function otpForm() {
  return inject(NonNullableFormBuilder).group(
    { code: [''] },
    { validators: schemaValidator(pick(zOtpVerificationBody, ['code'])) },
  )
}
