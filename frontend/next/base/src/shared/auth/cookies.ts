import 'server-only'

import type { AuthTokens } from '@/shared/api'
import { env } from '@/shared/config/env'

// The Next server keeps the API's tokens in its own cookies, on the Next origin: the browser
// never sees a token in JavaScript (HttpOnly) and never talks to the API. Both cookies are
// scoped to `/` because the proxy reads the refresh token on every page request.
export const ACCESS_COOKIE = 'access_token'
export const REFRESH_COOKIE = 'refresh_token'

export type SessionTokens = Pick<
  AuthTokens,
  'accessToken' | 'accessExpiresAt' | 'refreshToken' | 'refreshExpiresAt'
>

type CookieOptions = {
  httpOnly: boolean
  sameSite: 'lax'
  secure: boolean
  path: string
  maxAge: number
}

// What `cookies()` in an action and `response.cookies` in the proxy have in common.
export type CookieJar = {
  set: (name: string, value: string, options: CookieOptions) => unknown
  delete: (name: string) => unknown
}

// The lifetime comes from the API's own expiry, so the cookie and the token end together.
function secondsUntil(iso: string): number {
  return Math.max(0, Math.floor((Date.parse(iso) - Date.now()) / 1000))
}

function options(expiresAt: string): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: secondsUntil(expiresAt),
  }
}

export function setSessionCookies(jar: CookieJar, tokens: SessionTokens): void {
  jar.set(ACCESS_COOKIE, tokens.accessToken, options(tokens.accessExpiresAt))
  jar.set(REFRESH_COOKIE, tokens.refreshToken, options(tokens.refreshExpiresAt))
}

export function clearSessionCookies(jar: CookieJar): void {
  jar.delete(ACCESS_COOKIE)
  jar.delete(REFRESH_COOKIE)
}
