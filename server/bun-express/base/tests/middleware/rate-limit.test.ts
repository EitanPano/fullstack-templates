import { afterEach, describe, expect, it, setSystemTime, spyOn } from 'bun:test'
import express from 'express'
import type { Request } from 'express'
import request from 'supertest'

import * as cache from '../../src/services/cache'
import { errorHandler } from '../../src/middleware/error-handler'
import { byBodyPath, byBodyString, byIp, rateLimit } from '../../src/middleware/rate-limit'

type Body = { error: { code: string } }

afterEach(() => setSystemTime())

function probe(options: Parameters<typeof rateLimit>[0]) {
  const app = express()
  app.set('trust proxy', true)
  app.use(express.json({ limit: '2mb' }))
  app.post('/hit', rateLimit(options), (_req, res) => {
    res.json({ ok: true })
  })
  app.use(errorHandler)
  return app
}

describe('rateLimit', () => {
  it('answers 200 under the limit and 429 past it with Retry-After', async () => {
    const app = probe({ name: 't-limit', limit: 2, window: '1m', key: byIp })

    expect((await request(app).post('/hit')).status).toBe(200)
    expect((await request(app).post('/hit')).status).toBe(200)
    const res = await request(app).post('/hit')

    expect(res.status).toBe(429)
    expect((res.body as Body).error.code).toBe('rate_limited')
    expect(res.headers['retry-after']).toBe('60')
  })

  it('lets requests through again once the window has passed', async () => {
    const app = probe({ name: 't-window', limit: 1, window: '1m', key: byIp })
    const start = Date.now()
    setSystemTime(new Date(start))
    await request(app).post('/hit')
    expect((await request(app).post('/hit')).status).toBe(429)

    setSystemTime(new Date(start + 61_000))

    expect((await request(app).post('/hit')).status).toBe(200)
  })

  it('counts different subjects separately', async () => {
    const app = probe({ name: 't-subjects', limit: 1, window: '1m', key: byIp })

    expect((await request(app).post('/hit').set('x-forwarded-for', '1.1.1.1')).status).toBe(200)
    expect((await request(app).post('/hit').set('x-forwarded-for', '2.2.2.2')).status).toBe(200)
    expect((await request(app).post('/hit').set('x-forwarded-for', '1.1.1.1')).status).toBe(429)
  })

  it('never limits when the key is undefined', async () => {
    const app = probe({ name: 't-skip', limit: 1, window: '1m', key: () => undefined })

    for (let i = 0; i < 3; i++) expect((await request(app).post('/hit')).status).toBe(200)
  })
})

describe('rateLimit keys', () => {
  it('hashes the subject so a 1 MB email yields a bounded key', async () => {
    const incr = spyOn(cache, 'incr')
    const app = probe({ name: 't-key', limit: 5, window: '1m', key: byBodyString('email') })

    const res = await request(app)
      .post('/hit')
      .send({ email: `${'a'.repeat(1_000_000)}@x.io` })

    expect(res.status).toBe(200)
    const keys = incr.mock.calls.map((call) => call[0])
    incr.mockRestore()
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatch(/^rl:[^:]+:[0-9a-f]{64}$/)
  })

  it('counts two spellings of one email as one subject', async () => {
    const app = probe({ name: 't-spelling', limit: 1, window: '1m', key: byBodyString('email') })

    expect((await request(app).post('/hit').send({ email: 'Ada@Example.com' })).status).toBe(200)
    expect((await request(app).post('/hit').send({ email: '  ada@example.COM ' })).status).toBe(429)
  })
})

describe('byBodyString', () => {
  const read = (body: unknown) => byBodyString('email')({ body } as Request)

  it('trims and lower-cases a string field', () => {
    expect(read({ email: '  Ada@Example.COM ' })).toBe('ada@example.com')
  })

  it('returns undefined for a missing or non-string field and for a non-object body', () => {
    expect(read({})).toBeUndefined()
    expect(read({ email: 5 })).toBeUndefined()
    expect(read('text')).toBeUndefined()
    expect(read(undefined)).toBeUndefined()
    expect(read(null)).toBeUndefined()
  })
})

describe('byBodyPath', () => {
  const read = (body: unknown) => byBodyPath('target', 'value')({ body } as Request)

  it('reads a nested string, trimmed and lower-cased', () => {
    expect(read({ target: { type: 'email', value: ' Ada@Example.COM ' } })).toBe('ada@example.com')
  })

  it('returns undefined for a missing path, a non-string leaf and a non-object body', () => {
    expect(read({})).toBeUndefined()
    expect(read({ target: {} })).toBeUndefined()
    expect(read({ target: { value: 5 } })).toBeUndefined()
    expect(read({ target: 'x' })).toBeUndefined()
    expect(read('text')).toBeUndefined()
    expect(read(undefined)).toBeUndefined()
  })
})
