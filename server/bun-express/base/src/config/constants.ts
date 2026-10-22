// Policy constants: how the app behaves (durations, attempts, limits per window, cookie and // @auth
// Policy constants: how the app behaves (durations, attempts, limits per window, header // @noauth
// header names) live here; limits of the data itself (field lengths) live in // @auth
// names) live here; limits of the data itself (field lengths) live in // @noauth
// models/<name>/constants.ts. Durations are strings that services/utils/time.ts parses.
// @auth-start
export const ACCESS_TOKEN_TTL = '15m'
export const REFRESH_TOKEN_TTL = '30d'
export const SESSION_ABSOLUTE_TTL = '90d'
export const REFRESH_REUSE_GRACE = '30s'
export const OTP_LENGTH = 6
export const OTP_TTL = '10m'
export const OTP_MAX_ATTEMPTS = 5
// @auth-end
export const RATE_LIMITS = {
  registerPerIp: { limit: 10, window: '15m' }, // @auth
  loginPerIp: { limit: 10, window: '15m' }, // @auth
  loginPerEmail: { limit: 5, window: '15m' }, // @auth
  refreshPerIp: { limit: 30, window: '15m' }, // @auth
  otpPerIp: { limit: 10, window: '1h' }, // @auth
  otpPerTarget: { limit: 5, window: '1h' }, // @auth
  otpVerificationPerIp: { limit: 20, window: '15m' }, // @auth
  createPostPerIp: { limit: 30, window: '15m' },
} as const
// @auth-start
export const COOKIE_NAMES = { access: 'access_token', refresh: 'refresh_token' } as const
export const COOKIE_PATHS = { access: '/', refresh: '/api/auth' } as const
export const BEARER_PREFIX = 'Bearer '
// @auth-end
