// rate-limit.ts belongs: fixed-window request limiting per subject, mounted per endpoint
// before validate. It does not belong: choosing limits (config/constants.ts RATE_LIMITS).
// It is the only middleware allowed to import services/cache.ts.
import type { Request, RequestHandler } from 'express'
import { isIPv4, isIPv6 } from 'node:net'

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
  return rateLimitSubject(req.ip ?? 'unknown')
}

// An IPv6 client is limited as its /64, since a subscriber owns the whole /64 and rotating
// addresses inside it must not dodge the limit. IPv4 and IPv4-mapped IPv6 are the IPv4; anything
// that is not an address is unchanged.
export function rateLimitSubject(address: string): string {
  const bare = address.split('%')[0] ?? address
  if (isIPv4(bare)) return bare
  if (!isIPv6(bare)) return address
  const hextets = expandIPv6(bare)
  if (hextets.slice(0, 5).every((h) => h === 0) && hextets[5] === 0xffff) {
    const [high = 0, low = 0] = hextets.slice(6)
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.')
  }
  return `${compressIPv6([...hextets.slice(0, 4), 0, 0, 0, 0])}/64`
}

// The eight 16-bit groups of a valid IPv6 address, with `::` and a dotted IPv4 tail expanded.
function expandIPv6(address: string): number[] {
  const [head = '', tail] = address.split('::')
  const groups = (text: string): number[] =>
    text === ''
      ? []
      : text.split(':').flatMap((part) => {
          if (!part.includes('.')) return [parseInt(part, 16)]
          const [a = 0, b = 0, c = 0, d = 0] = part.split('.').map(Number)
          return [(a << 8) | b, (c << 8) | d]
        })
  const before = groups(head)
  if (tail === undefined) return before
  const after = groups(tail)
  return [...before, ...Array<number>(8 - before.length - after.length).fill(0), ...after]
}

// RFC 5952: lower-case, no leading zeros, the longest run of two or more zero groups (the first
// on a tie) as `::`.
function compressIPv6(hextets: number[]): string {
  let best = { start: -1, length: 1 }
  for (let start = 0; start < hextets.length; start++) {
    let end = start
    while (hextets[end] === 0) end++
    if (end - start > best.length) best = { start, length: end - start }
  }
  const text = (groups: number[]) => groups.map((h) => h.toString(16)).join(':')
  if (best.start < 0) return text(hextets)
  const left = text(hextets.slice(0, best.start))
  const right = text(hextets.slice(best.start + best.length))
  return `${left}::${right}`
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
