import { inject } from '@angular/core'
import { NonNullableFormBuilder } from '@angular/forms'

import { zCredentials, zOtpVerificationBody } from '@app/services/generated/zod.gen'
import { match } from '@app/shared/validators/match'
import { zodValidator } from '@app/shared/validators/zod.validator'

// The auth forms, typed, with every rule taken from the generated zod request schema (the server's
// contract): the e-mail pattern, the password length, the six-digit code. Call them in an
// injection context (a component field).

export function loginForm() {
  return inject(NonNullableFormBuilder).group(
    { email: [''], password: [''] },
    { validators: zodValidator(zCredentials) },
  )
}

// The confirm control is not in the contract; `match` compares it with the password.
export function registerForm() {
  return inject(NonNullableFormBuilder).group(
    { email: [''], password: [''], confirm: [''] },
    { validators: [zodValidator(zCredentials), match('password', 'confirm')] },
  )
}

export function otpForm() {
  return inject(NonNullableFormBuilder).group(
    { code: [''] },
    { validators: zodValidator(zOtpVerificationBody.pick({ code: true })) },
  )
}
