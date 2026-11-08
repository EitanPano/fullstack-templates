import '@/shared/validators/zod-config'
import { zCredentials, zOtpVerificationBody } from '@/services/generated/zod.gen'
import { match } from '@/shared/validators/match'
import { useZodForm } from '@/shared/validators/zod-form'

// The auth forms, with every rule taken from the generated zod request schema (the server's
// contract): the e-mail pattern, the password length, the six-digit code. Call them in a
// component's setup.

export function loginForm() {
  return useZodForm(zCredentials, { email: '', password: '' })
}

// The confirm field is not in the contract; `match` compares it with the password, and the parsed
// value the handler receives has only the credentials.
export function registerForm() {
  return useZodForm(zCredentials, { email: '', password: '', confirm: '' }, [
    match('password', 'confirm'),
  ])
}

export function otpForm() {
  return useZodForm(zOtpVerificationBody.pick({ code: true }), { code: '' })
}
