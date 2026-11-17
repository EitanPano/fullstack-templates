// The scheduled job of the `jobs` flag, called as the platform calls it: the one cleanup of
// expired rate-limit rows, against a migrated D1.
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import { RATE_LIMIT_CLEANUP_BATCH } from '../../server/config/constants'
import { purgeExpiredRateLimits } from '../../server/middleware/rate-limit-cleanup'
import worker from '../../workers/jobs'

const NOW = 1_800_000_000_000

async function insertRows(prefix: string, count: number, expiresAt: number): Promise<void> {
  const statement = env.DB.prepare(
    'INSERT INTO rate_limit (key, window_start, expires_at, count) VALUES (?, ?, ?, 1)',
  )
  await env.DB.batch(
    Array.from({ length: count }, (_, index) =>
      statement.bind(`${prefix}:${String(index)}`, expiresAt - 1000, expiresAt),
    ),
  )
}

async function keys(): Promise<string[]> {
  const { results } = await env.DB.prepare('SELECT key FROM rate_limit ORDER BY key').all<{
    key: string
  }>()
  return results.map((row) => row.key)
}

function run(scheduledTime = NOW): Promise<void> {
  const controller = { scheduledTime, cron: '17 * * * *', noRetry: () => undefined }
  const context = { waitUntil: () => undefined, passThroughOnException: () => undefined }
  return Promise.resolve(
    worker.scheduled(
      controller as unknown as ScheduledController,
      env,
      context as unknown as ExecutionContext,
    ),
  )
}

describe('the scheduled cleanup', () => {
  it('deletes the expired rate-limit rows and keeps the live ones', async () => {
    await insertRows('old', 3, NOW - 1)
    await insertRows('live', 2, NOW + 60_000)

    await run()

    expect(await keys()).toEqual(['live:0', 'live:1'])
  })

  it('succeeds on an empty table', async () => {
    await expect(run()).resolves.toBeUndefined()
    expect(await keys()).toEqual([])
  })

  it('is bounded: one run deletes at most maxBatches batches', async () => {
    await insertRows('old', RATE_LIMIT_CLEANUP_BATCH * 2 + 20, NOW - 1)

    const deleted = await purgeExpiredRateLimits(env, NOW, { maxBatches: 2 })

    expect(deleted).toBe(RATE_LIMIT_CLEANUP_BATCH * 2)
    expect(await keys()).toHaveLength(20)
  })

  it('does not touch a row that expires exactly now', async () => {
    await insertRows('edge', 1, NOW)

    await run()

    expect(await keys()).toEqual(['edge:0'])
  })
})
