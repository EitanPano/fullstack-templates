import type { Role } from './type'

// The routes the auth glue sends a visitor to, and the query parameter that remembers where the
// visitor was going (`/auth/login?next=%2Fprofile`).
export const LOGIN_PATH = '/auth/login'
export const FORBIDDEN_PATH = '/forbidden'
export const PROFILE_PATH = '/profile'
export const VERIFY_OTP_PATH = '/auth/verify-otp'
export const NEXT_PARAM = 'next'

// How each role reads on screen: the copy key.
export const ROLE_LABEL_KEYS: Record<Role, string> = {
  user: 'role.user',
  admin: 'role.admin',
}
