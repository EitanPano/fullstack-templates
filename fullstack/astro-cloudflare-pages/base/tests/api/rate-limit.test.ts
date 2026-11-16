import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import { RATE_LIMITS } from '../../server/config/constants'
import { handle, json as jsonResponse } from '../../server/middleware/handler'
import { byBodyString, byIp, rateLimit } from '../../server/middleware/rate-limit'
import { sha256 } from '../../server/services/security/crypto'
import { json, send, settle, through } from './helpers'

type Envelope = { error: { code: string; message: string }; requestId: string }

const open = (limit = 2, extra: Partial<Parameters<typeof rateLimit>[0]> = {}) =>
  handle(rateLimit({ name: 'probe', limit, window: '15m', key: byIp, ...extra }), () =>
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

  it('counts in one row per subject, with one statement per request', async () => {
    const route = open(10)
    for (let i = 0; i < 4; i++) await through(route, '/probe', from('203.0.113.1'))
    const stored = await rows()
    expect(stored).toHaveLength(1)
    expect(stored[0]?.count).toBe(4)
  })

  it('hashes the subject so the key is bounded and the subject is not in the table', async () => {
    const big = `${'a'.repeat(1_000_000)}@example.com`
    const route = handle(
      rateLimit({ name: 'email', limit: 5, window: '1h', key: byBodyString('email') }),
      () => jsonResponse({ ok: true }),
    )
    await through(route, '/probe', { method: 'POST', body: { email: big } })
    const [row] = await rows()
    expect(row?.key).toBe(`email:${await sha256(big.toLowerCase())}`)
    expect(row?.key.length).toBeLessThan(100)
    expect(row?.key).not.toContain('example.com')
  })

  it('counts two spellings of one email as one subject', async () => {
    const route = handle(
      rateLimit({ name: 'email', limit: 1, window: '1h', key: byBodyString('email') }),
      () => jsonResponse({ ok: true }),
    )
    await through(route, '/probe', { method: 'POST', body: { email: 'Ada@Example.com' } })
    const second = await through(route, '/probe', {
      method: 'POST',
      body: { email: ' ada@example.COM ' },
    })
    expect(second.status).toBe(429)
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
    const response = through(open(5), '/probe')
    await response
    await settle(response)
    const keys = (await rows()).map((row) => row.key)
    expect(keys).not.toContain('probe:stale')
    expect(keys).toHaveLength(1)
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
})
