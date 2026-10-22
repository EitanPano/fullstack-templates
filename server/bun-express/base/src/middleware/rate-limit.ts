// rate-limit.ts belongs: fixed-window request limiting per subject, mounted per endpoint
// before validate. It does not belong: choosing limits (config/constants.ts RATE_LIMITS).
// It is the only middleware allowed to import services/cache.ts.
import type { Request, RequestHandler } from 'express'

import { incr } from '../services/cache'
import { sha256 } from '../services/security/crypto'
import { AppError } from '../services/utils/error'
import { parseDuration } from '../services/utils/time'

export type RateLimitOptions = {
  name: string
  limit: number
  // A duration string, e.g. RATE_LIMITS.loginPerIp.window. // @auth
  // A duration string, e.g. RATE_LIMITS.createPostPerIp.window. // @noauth
  window: string
  // The subject being limited; undefined skips the limit (validation rejects the request anyway).
  key: (req: Request) => string | undefined
}

export function rateLimit({ name, limit, window, key }: RateLimitOptions): RequestHandler {
  const windowMs = parseDuration(window)
  return async (req, res, next) => {
    const subject = key(req)
    if (subject === undefined) {
      next()
      return
    }
    // Hashed so the key's size is bounded whatever the client sends (a megabyte email would
    // otherwise become a megabyte cache key) and the subject never sits in the cache in clear.
    try {
      const count = await incr(`rl:${name}:${sha256(subject)}`, windowMs)
      if (count > limit) {
        // The window length is an upper bound: the window started at the first hit, not now.
        res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)))
        next(new AppError('rate_limited', 'too many requests'))
        return
      }
      next()
    } catch (error) {
      next(error)
    }
  }
}

// Only right behind a proxy that forwards X-Forwarded-For when TRUST_PROXY (app.set('trust
// proxy') in server.ts) trusts it; otherwise every client shares the proxy's address.
export function byIp(req: Request): string {
  return req.ip ?? 'unknown'
}

// The limiter runs before validate, so the body may be unparsed or not an object.
export function byBodyString(field: string): (req: Request) => string | undefined {
  return (req) => {
    const body: unknown = req.body
    if (typeof body !== 'object' || body === null) return undefined
    const value = (body as Record<string, unknown>)[field]
    if (typeof value !== 'string') return undefined
    return value.trim().toLowerCase()
  }
}

// Same contract as byBodyString for a nested value, e.g. byBodyPath('target', 'value').
export function byBodyPath(...path: string[]): (req: Request) => string | undefined {
  return (req) => {
    let node: unknown = req.body
    for (const key of path) {
      if (typeof node !== 'object' || node === null) return undefined
      node = (node as Record<string, unknown>)[key]
    }
    return typeof node === 'string' ? node.trim().toLowerCase() : undefined
  }
}
