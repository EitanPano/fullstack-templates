import { zPostApiAuthLoginBody, zPostApiAuthSignupBody } from '@/services/generated/zod.gen'
import {
  check,
  email as emailFormat,
  extend,
  field,
  isValid,
  text,
  type Input,
} from '@/shared/utils/validation'

// The form schemas extend the generated request schemas, so the limits (password length, email
// size) come from the server's contract and are never copied. The generated email carries no
// format on one server (Bun) and a regex on another (Python), each with a default message, so
// the form runs both checks and words every failure itself.
const generatedEmail = field(zPostApiAuthLoginBody, 'email')
const formatEmail = emailFormat()
const email = check(
  text(),
  (value) => isValid(generatedEmail, value) && isValid(formatEmail, value),
  { message: 'Enter a valid email address' },
)

export const signInSchema = extend(zPostApiAuthLoginBody, { email })

export const signUpSchema = check(
  extend(zPostApiAuthSignupBody, { email, confirm: text() }),
  (value) => value.password === value.confirm,
  { path: ['confirm'], message: 'Passwords do not match' },
)

export type SignInInput = Input<typeof signInSchema>
export type SignUpInput = Input<typeof signUpSchema>
