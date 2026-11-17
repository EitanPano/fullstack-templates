import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import { RATE_LIMITS } from '../../server/config/constants'
import { handle, json as jsonResponse } from '../../server/middleware/handler'
import { byIp, rateLimit } from '../../server/middleware/rate-limit'
import { sha256 } from '../../server/services/security/crypto'
import { createModule, json, send, settle, through } from './helpers'

type Envelope = { error: { code: string; message: string }; requestId: string }

// The cleanup sampler says no unless a test asks for it, so no test depends on chance.
const open = (limit = 2, extra: Partial<Parameters<typeof rateLimit>[0]> = {}) =>
  handle(rateLimit({ name: 'probe', limit, window: '15m', key: byIp, sample: () => false, ...extra }), () =>
    jsonResponse({ ok: true }),
  )

const from = (address: string) => ({ headers: { 'CF-Connecting-IP': address } })

async function rows() {
  const { results } = await env.DB.prepare('SELECT key, count FROM rate_limit').all<{
    key: string
    count: number
  }>()
  return results
}

describe('rateLimit', () => {
  it('answers 200 under the limit and 429 past it with Retry-After and the envelope', async () => {
    const route = open(2)
    expect((await through(route, '/probe', from('203.0.113.1'))).status).toBe(200)
    expect((await through(route, '/probe', from('203.0.113.1'))).status).toBe(200)

    const limited = await through(route, '/probe', from('203.0.113.1'))
    expect(limited.status).toBe(429)
    expect(await json<Envelope>(limited)).toMatchObject({
      error: { code: 'rate_limited', message: 'too many requests' },
      requestId: limited.headers.get('x-request-id'),
    })
    const retryAfter = Number(limited.headers.get('retry-after'))
    expect(retryAfter).toBeGreaterThan(0)
    expect(retryAfter).toBeLessThanOrEqual(900)
  })

  it('counts different subjects separately', async () => {
    const route = open(1)
    expect((await through(route, '/probe', from('203.0.113.1'))).status).toBe(200)
    expect((await through(route, '/probe', from('203.0.113.2'))).status).toBe(200)
    expect((await through(route, '/probe', from('203.0.113.1'))).status).toBe(429)
  })

  it('counts different limiters separately', async () => {
    const a = open(1, { name: 'a' })
    const b = open(1, { name: 'b' })
    expect((await through(a, '/probe')).status).toBe(200)
    expect((await through(b, '/probe')).status).toBe(200)
    expect((await through(a, '/probe')).status).toBe(429)
  })

  it('lets requests through again once the window has passed', async () => {
    const route = open(1)
    await through(route, '/probe', from('203.0.113.1'))
    expect((await through(route, '/probe', from('203.0.113.1'))).status).toBe(429)

    await env.DB.prepare('UPDATE rate_limit SET expires_at = expires_at - ?')
      .bind(15 * 60_000 + 1)
      .run()

    expect((await through(route, '/probe', from('203.0.113.1'))).status).toBe(200)
    expect((await rows())[0]?.count).toBe(1)
  })

  it('never limits when the key is undefined, and writes nothing', async () => {
    const route = open(1, { key: () => undefined })
    for (let i = 0; i < 3; i++) expect((await through(route, '/probe')).status).toBe(200)
    expect(await rows()).toEqual([])
  })

  it('multiplies the limit by the scale, rounding up', async () => {
    const route = open(2, { scale: 2.5 })
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) statuses.push((await through(route, '/probe')).status)
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429])
  })

  it('counts in one row per subject', async () => {
    const route = open(10)
    for (let i = 0; i < 4; i++) await through(route, '/probe', from('203.0.113.1'))
    const stored = await rows()
    expect(stored).toHaveLength(1)
    expect(stored[0]?.count).toBe(4)
  })

  it('checks a request with one statement, an upsert that returns the count', async () => {
    const statements: string[] = []
    const counted = new Proxy(env.DB, {
      get(target, property) {
        const value: unknown = Reflect.get(target, property)
        if (typeof value !== 'function') return value
        return (...args: unknown[]) => {
          if (property === 'prepare' || property === 'exec') statements.push(String(args[0]))
          if (property === 'batch') statements.push('batch')
          return (value as (...a: unknown[]) => unknown).apply(target, args)
        }
      },
    })

    const res = await through(open(10), '/probe', { bindings: { ...env, DB: counted } })

    expect(res.status).toBe(200)
    expect(statements).toHaveLength(1)
    expect(statements[0]).toMatch(/insert into "rate_limit".*on conflict.*returning/is)
  })

  it('hashes the subject so the key is bounded and the subject is not in the table', async () => {
    const big = `${'a'.repeat(1_000_000)}@example.com`
    const route = handle(
      rateLimit({ name: 'email', limit: 5, window: '1h', key: () => big, sample: () => false }),
      () => jsonResponse({ ok: true }),
    )
    await through(route, '/probe')
    const [row] = await rows()
    expect(row?.key).toBe(`email:${await sha256(big)}`)
    expect(row?.key.length).toBeLessThan(100)
    expect(row?.key).not.toContain('example.com')
  })

  it('shares one bucket across an IPv6 /64 and not with another /64', async () => {
    const route = open(1)
    expect((await through(route, '/probe', from('2001:db8:1:2:aaaa::1'))).status).toBe(200)
    expect((await through(route, '/probe', from('2001:db8:1:2:bbbb::9'))).status).toBe(429)
    expect((await through(route, '/probe', from('2001:db8:1:3::1'))).status).toBe(200)
  })

  it('keys an IPv4-mapped IPv6 address as its IPv4', async () => {
    const route = open(1)
    expect((await through(route, '/probe', from('203.0.113.9'))).status).toBe(200)
    expect((await through(route, '/probe', from('::ffff:203.0.113.9'))).status).toBe(429)
  })

  it('shares one subject across requests with no CF-Connecting-IP, as a local run does', async () => {
    const route = open(1)
    expect((await through(route, '/probe')).status).toBe(200)
    expect((await through(route, '/probe')).status).toBe(429)
  })

  it('deletes stale counter rows opportunistically, in a bounded batch, in waitUntil', async () => {
    await env.DB.prepare(
      'INSERT INTO rate_limit (key, window_start, expires_at, count) VALUES (?, ?, ?, 1)',
    )
      .bind('probe:stale', Date.now() - 4 * 86_400_000, Date.now() - 3 * 86_400_000)
      .run()
    const response = through(open(5, { sample: () => true }), '/probe')
    await response
    await settle(response)
    const keys = (await rows()).map((row) => row.key)
    expect(keys).not.toContain('probe:stale')
    expect(keys).toHaveLength(1)
  })

  it('schedules the cleanup only when the sampler says yes', async () => {
    const skipped = through(open(5, { sample: () => false }), '/probe')
    await skipped
    expect(skipped.waited).toHaveLength(0)

    const sampled = through(open(5, { sample: () => true }), '/probe')
    await sampled
    expect(sampled.waited).toHaveLength(1)
  })

  it('samples one request in twenty by default', async () => {
    const route = handle(
      rateLimit({ name: 'default-sample', limit: 1_000_000, window: '15m', key: byIp }),
      () => jsonResponse({ ok: true }),
    )
    let scheduled = 0
    for (let i = 0; i < 400; i++) {
      const response = through(route, '/probe')
      await response
      scheduled += response.waited.length
    }
    // Binomial(400, 1/20): mean 20, deviation about 4.4; the bounds are over six deviations out.
    expect(scheduled).toBeGreaterThan(0)
    expect(scheduled).toBeLessThan(60)
  })

  it('never schedules the cleanup on a request it answers with 429', async () => {
    const route = open(1, { sample: () => true })
    await through(route, '/probe')

    const limited = through(route, '/probe')
    expect((await limited).status).toBe(429)
    expect(limited.waited).toHaveLength(0)
  })

  it('has an index on the expiry, so the cleanup does not read the whole table', async () => {
    const { results } = await env.DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'rate_limit'",
    ).all<{ sql: string | null }>()
    expect(results.some((row) => /expires_at/.test(row.sql ?? ''))).toBe(true)
    const plan = await env.DB.prepare(
      'EXPLAIN QUERY PLAN SELECT key FROM rate_limit WHERE expires_at < ? LIMIT 50',
    )
      .bind(Date.now())
      .all<{ detail: string }>()
    expect(plan.results.map((row) => row.detail).join(' ')).toMatch(/USING (COVERING )?INDEX/)
  })
})

describe('POST /api/module through the real routing', () => {
  it('is limited per address by RATE_LIMITS.createModulePerIp', async () => {
    const { limit } = RATE_LIMITS.createModulePerIp
    for (let i = 0; i < limit; i++) {
      const res = await send('/api/module', { method: 'POST', body: { name: `m${i}` } })
      expect(res.status).toBe(201)
    }
    const limited = await send('/api/module', { method: 'POST', body: { name: 'one too many' } })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBeTruthy()
    // A read is not limited.
    expect((await send('/api/module')).status).toBe(200)
  })

  it('limits PATCH and DELETE per address, each with its own counter', async () => {
    const created = await createModule('limited')
    const path = `/api/module/${created.id}`

    const patched: number[] = []
    for (let i = 0; i <= RATE_LIMITS.updateModulePerIp.limit; i++) {
      patched.push((await send(path, { method: 'PATCH', body: { name: `n${i}` } })).status)
    }
    expect(patched.slice(0, -1).every((status) => status === 200)).toBe(true)
    expect(patched.at(-1)).toBe(429)

    const deleted: number[] = []
    for (let i = 0; i <= RATE_LIMITS.deleteModulePerIp.limit; i++) {
      deleted.push((await send(path, { method: 'DELETE' })).status)
    }
    expect(deleted.slice(0, -1).includes(429)).toBe(false)
    expect(deleted.at(-1)).toBe(429)
    expect((await send(path, { method: 'DELETE' })).headers.get('retry-after')).toBeTruthy()
    // A read of the same row is not limited.
    expect((await send(path)).status).toBe(404)
  })
})
