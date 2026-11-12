import '@/shared/utils/validation'
import { zCredentials, zOtpVerificationBody } from '@/services/generated/zod.gen'
import { match } from '@/shared/validators/match'
import { pick } from '@/shared/utils/validation'
import { useSchemaForm } from '@/shared/validators/schema-form'

// The auth forms, with every rule taken from the generated zod request schema (the server's
// contract): the e-mail pattern, the password length, the six-digit code. Call them in a
// component's setup.

export function loginForm() {
  return useSchemaForm(zCredentials, { email: '', password: '' })
}

// The confirm field is not in the contract; `match` compares it with the password, and the parsed
// value the handler receives has only the credentials.
export function signupForm() {
  return useSchemaForm(zCredentials, { email: '', password: '', confirm: '' }, [
    match('password', 'confirm'),
  ])
}

export function otpForm() {
  return useSchemaForm(pick(zOtpVerificationBody, ['code']), { code: '' })
}
