// rate-limit.ts belongs: fixed-window request limiting per subject, as a gate mounted per endpoint
// before validate. One upsert statement per check (insert, or increment, or restart an expired
// window, `RETURNING` the count), so concurrent requests cannot race. It applies
// RATE_LIMIT_SCALE to every limit, so no caller scales its own.
// It does not belong: choosing limits (config/constants.ts RATE_LIMITS) or reading the address
// (services/utils/client-address.ts).
import { sql } from 'drizzle-orm'

import { RATE_LIMIT_CLEANUP_SAMPLE } from '../config/constants'
import { rateLimitTable } from '../infra/tables'
import { sha256 } from '../services/security/crypto'
import { clientAddress, rateLimitSubject } from '../services/utils/client-address'
import { AppError } from '../services/utils/error'
import { parseDuration } from '../services/utils/time'
import type { Context, Gate } from './handler'
import { deleteExpiredRateLimits } from './rate-limit-cleanup'

// Same bounds as RATE_LIMIT_SCALE in config/env.ts: no value may disable limiting.
const MAX_RATE_LIMIT_SCALE = 1000

export type RateLimitOptions = {
  name: string
  limit: number
  // Multiplies the limit; defaults to RATE_LIMIT_SCALE, which is 1 unless an e2e run raises it.
  scale?: number
  // A duration string, e.g. RATE_LIMITS.createModulePerIp.window.
  window: string
  // The subject being limited; undefined skips the limit (validation rejects the request anyway).
  key: (ctx: Context) => string | undefined | Promise<string | undefined>
  // Whether this request also deletes a batch of expired rows; one in RATE_LIMIT_CLEANUP_SAMPLE
  // by default. A test passes a function that answers the same every time.
  sample?: () => boolean
}

// Rounded up so a scale never lowers a limit; the epsilon keeps 10 * 1.1 (11.000000000000002) at 11.
export function scaledLimit(limit: number, scale: number): number {
  if (!(scale >= 1 && scale <= MAX_RATE_LIMIT_SCALE)) {
    throw new RangeError(`rate limit scale must be between 1 and ${String(MAX_RATE_LIMIT_SCALE)}`)
  }
  return Math.ceil(limit * scale - 1e-9)
}

export function rateLimit({
  name,
  limit,
  scale,
  window,
  key,
  sample = () => Math.random() < 1 / RATE_LIMIT_CLEANUP_SAMPLE,
}: RateLimitOptions): Gate {
  const windowMs = parseDuration(window)
  return async (ctx) => {
    const subject = await key(ctx)
    if (subject === undefined) return
    const max = scaledLimit(limit, scale ?? ctx.env.RATE_LIMIT_SCALE)
    const now = Date.now()
    // Hashed so the key's size is bounded whatever the client sends (a megabyte email would
    // otherwise become a megabyte key) and the subject never sits in the table in clear.
    const id = `${name}:${await sha256(subject)}`
    const expired = sql`${rateLimitTable.expiresAt} <= ${now}`
    const [row] = await ctx.db
      .insert(rateLimitTable)
      .values({ key: id, windowStart: now, expiresAt: now + windowMs, count: 1 })
      .onConflictDoUpdate({
        target: rateLimitTable.key,
        set: {
          count: sql`case when ${expired} then 1 else ${rateLimitTable.count} + 1 end`,
          windowStart: sql`case when ${expired} then ${now} else ${rateLimitTable.windowStart} end`,
          expiresAt: sql`case when ${expired} then ${now + windowMs} else ${rateLimitTable.expiresAt} end`,
        },
      })
      .returning({ count: rateLimitTable.count, expiresAt: rateLimitTable.expiresAt })
    if (row === undefined) throw new Error('rate limit upsert returned no row')
    if (row.count > max) {
      const seconds = Math.max(1, Math.ceil((row.expiresAt - now) / 1000))
      throw new AppError('rate_limited', 'too many requests', undefined, {
        headers: { 'Retry-After': String(seconds) },
      })
    }
    // After the response, for a sample of the requests that pass (never one answered 429, so a
    // flood pays nothing extra): a bounded batch of rows that expired, no scheduler needed.
    if (sample()) ctx.waitUntil(deleteStale(ctx, now))
  }
}

async function deleteStale(ctx: Context, now: number): Promise<void> {
  try {
    await deleteExpiredRateLimits(ctx.db, now)
  } catch (error) {
    ctx.log.warn('rate limit cleanup failed', {}, error)
  }
}

// Only meaningful where Cloudflare sets CF-Connecting-IP; a local run shares one subject.
export function byIp(ctx: Context): string {
  return rateLimitSubject(clientAddress(ctx.request))
}
