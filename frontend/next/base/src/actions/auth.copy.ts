// Copy for each outcome, keyed by the envelope's `code` (services/call.ts has the defaults).
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
