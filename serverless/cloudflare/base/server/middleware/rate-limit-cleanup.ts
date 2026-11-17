// rate-limit-cleanup.ts belongs: deleting the rate-limit rows whose window has ended, in bounded
// batches. The rate-limit gate calls one batch after a limited request (waitUntil); the scheduled
// job of the `jobs` flag calls `purgeExpiredRateLimits`. It sits here because both entries may
// import middleware/ and neither may import infra/ or services/.
// It does not belong: counting (rate-limit.ts) or choosing the batch size (config/constants.ts).
import { and, lt, sql } from 'drizzle-orm'

import { RATE_LIMIT_CLEANUP_BATCH, RATE_LIMIT_PURGE_MAX_BATCHES } from '../config/constants'
import type { Bindings } from '../infra/bindings'
import { createDb, type Db } from '../infra/db'
import { rateLimitTable } from '../infra/tables'
import { createLogger } from '../services/logger'

// One bounded batch: up to `batch` rows that expired before `now`; returns how many went.
export async function deleteExpiredRateLimits(
  db: Db,
  now: number,
  batch: number = RATE_LIMIT_CLEANUP_BATCH,
): Promise<number> {
  const deleted = await db
    .delete(rateLimitTable)
    .where(
      and(
        lt(rateLimitTable.expiresAt, now),
        sql`${rateLimitTable.key} in (select ${rateLimitTable.key} from ${rateLimitTable} where ${rateLimitTable.expiresAt} < ${now} limit ${batch})`,
      ),
    )
    .returning({ key: rateLimitTable.key })
  return deleted.length
}

// The job: batches until one comes back short or `maxBatches` is reached, so a run is bounded
// whatever the table holds; the next run continues. Returns the rows deleted.
export async function purgeExpiredRateLimits(
  bindings: Bindings,
  now: number = Date.now(),
  { maxBatches = RATE_LIMIT_PURGE_MAX_BATCHES }: { maxBatches?: number } = {},
): Promise<number> {
  const db = createDb(bindings)
  let total = 0
  for (let batches = 0; batches < maxBatches; batches++) {
    const deleted = await deleteExpiredRateLimits(db, now)
    total += deleted
    if (deleted < RATE_LIMIT_CLEANUP_BATCH) break
  }
  createLogger({ level: 'info' }).info('rate limit cleanup', { deleted: total })
  return total
}
