// cookies.ts belongs: reading and writing the auth cookies and the bearer header. Cookies are
// transport, so only route.ts files call this; controllers and services never see a cookie.
// It does not belong: token creation or verification (jwt.ts).
import type { CookieOptions, Request, Response } from 'express'
import { BEARER_PREFIX, COOKIE_NAMES, COOKIE_PATHS } from '../../config/constants'
import { env } from '../../config/env'
import type { AuthTokens } from '../../models/auth/type'

// One helper for set and clear: a browser drops a cookie only when path, domain and the other
// attributes match the ones it was set with, so the two must not drift.
function cookieAttributes(name: keyof typeof COOKIE_NAMES): CookieOptions {
  return {
    path: COOKIE_PATHS[name],
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV !== 'development',
    ...(env.COOKIE_DOMAIN === undefined ? {} : { domain: env.COOKIE_DOMAIN }),
  }
}

function msUntil(iso: string): number {
  return Math.max(0, new Date(iso).getTime() - Date.now())
}

export function setAuthCookies(res: Response, tokens: AuthTokens): void {
  res.cookie(COOKIE_NAMES.access, tokens.accessToken, {
    ...cookieAttributes('access'),
    maxAge: msUntil(tokens.accessExpiresAt),
  })
  res.cookie(COOKIE_NAMES.refresh, tokens.refreshToken, {
    ...cookieAttributes('refresh'),
    maxAge: msUntil(tokens.refreshExpiresAt),
  })
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(COOKIE_NAMES.access, cookieAttributes('access'))
  res.clearCookie(COOKIE_NAMES.refresh, cookieAttributes('refresh'))
}

// cookie-parser types req.cookies as any; narrow it here once.
function cookieOf(req: Request, name: string): unknown {
  const jar: unknown = req.cookies
  return typeof jar === 'object' && jar !== null
    ? (jar as Record<string, unknown>)[name]
    : undefined
}

// The header wins: a server-side client (the Next.js server) sends it explicitly, and a stale
// browser cookie must not override it.
export function readAccessToken(req: Request): string | undefined {
  const header = req.headers.authorization
  if (header?.startsWith(BEARER_PREFIX)) {
    const token = header.slice(BEARER_PREFIX.length).trim()
    return token === '' ? undefined : token
  }
  const cookie = cookieOf(req, COOKIE_NAMES.access)
  return typeof cookie === 'string' && cookie !== '' ? cookie : undefined
}

export function readRefreshToken(req: Request): string | undefined {
  const cookie = cookieOf(req, COOKIE_NAMES.refresh)
  if (typeof cookie === 'string' && cookie !== '') return cookie
  const body: unknown = req.body
  if (typeof body === 'object' && body !== null && 'refreshToken' in body) {
    const value = body.refreshToken
    if (typeof value === 'string' && value !== '') return value
  }
  return undefined
}
