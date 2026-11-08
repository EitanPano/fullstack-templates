import type { Role } from './interface'

// Where the auth glue sends an account, and the query parameter that remembers where a visitor was
// going (`/auth/login?next=%2Fprofile`). The login and forbidden paths live in core/config.
export const PROFILE_PATH = '/profile'
export const VERIFY_OTP_PATH = '/auth/verify-otp'
export const NEXT_PARAM = 'next'

// How each role reads on screen: the copy key.
export const ROLE_LABEL_KEYS: Record<Role, string> = {
  user: 'role.user',
  admin: 'role.admin',
}
