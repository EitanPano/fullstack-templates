import { afterEach, describe, expect, it, vi } from 'vitest'

import { entityTable } from '../../server/api/entity/model'
import { handle, json as jsonResponse } from '../../server/middleware/handler'
import { json, send, through } from './helpers'

afterEach(() => {
  vi.restoreAllMocks()
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function captureConsole() {
  const lines: string[] = []
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '))
    })
  }
  return lines
}

describe('the request id', () => {
  it('generates one for a request that has none and echoes it in the header and the envelope', async () => {
    const ok = await send('/api/health')
    expect(ok.headers.get('x-request-id')).toMatch(UUID)

    const missing = await send('/api/nope')
    const body = await json<{ requestId: string }>(missing)
    expect(body.requestId).toBe(missing.headers.get('x-request-id'))
  })

  it('honours a well-formed incoming id', async () => {
    const res = await send('/api/health', { headers: { 'x-request-id': 'client-id-12345' } })
    expect(res.headers.get('x-request-id')).toBe('client-id-12345')
  })

  it('replaces a malformed id: too short, too long, or with characters outside [\\w.-]', async () => {
    for (const bad of ['short', 'x'.repeat(129), 'has spaces in it!', 'line\tbreak-12345']) {
      const res = await send('/api/health', { headers: { 'x-request-id': bad } })
      expect(res.headers.get('x-request-id')).toMatch(UUID)
    }
  })
})

describe('the response headers', () => {
  it('sets the security headers an API response needs', async () => {
    const res = await send('/api/health')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
  })

  it('sets them on an error too, with a JSON content type', async () => {
    const res = await send('/api/nope')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-type')).toContain('application/json')
  })

  // An API response is data: nothing may frame it, run it or load a cross-origin page with it.
  it.each([
    ['a 200', '/api/health', {}, 200],
    ['a 404 envelope', '/api/nope', {}, 404],
    ['a 405', '/api/health', { method: 'DELETE' }, 405],
  ])('tells a browser not to render or share %s', async (_label, path, sent, status) => {
    const res = await send(path, sent)
    expect(res.status).toBe(status)
    expect(res.headers.get('content-security-policy')).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    )
    expect(res.headers.get('cross-origin-resource-policy')).toBe('same-origin')
  })

  it('keeps a cache-control the handler chose', async () => {
    const cached = handle(() =>
      jsonResponse({ ok: true }, 200, { 'cache-control': 'public, max-age=60' }),
    )
    const res = await through(cached, '/probe')
    expect(res.headers.get('cache-control')).toBe('public, max-age=60')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })
})

describe('the request log', () => {
  const ok = handle(() => jsonResponse({ ok: true }))

  it('writes one JSON line per finished request: method, path, status, duration, request id', async () => {
    const lines = captureConsole()
    const res = await through(ok, '/api/thing', { method: 'GET' })
    const requests = lines.filter((line) => line.includes('"message":"request"'))
    expect(requests).toHaveLength(1)
    expect(JSON.parse(requests[0]!)).toMatchObject({
      level: 'info',
      message: 'request',
      method: 'GET',
      path: '/api/thing',
      status: 200,
      requestId: res.headers.get('x-request-id'),
    })
    expect(typeof (JSON.parse(requests[0]!) as { durationMs: unknown }).durationMs).toBe('number')
  })

  it('logs the status of an error response', async () => {
    const lines = captureConsole()
    await through(
      handle(() => jsonResponse({}, 418)),
      '/api/teapot',
    )
    expect(lines.join('\n')).toContain('"status":418')
  })

  it('leaves the query string out of the line', async () => {
    const lines = captureConsole()
    await through(ok, '/api/thing?email=a%40b.c&token=abc123')
    const text = lines.join('\n')
    expect(text).toContain('"path":"/api/thing"')
    expect(text).not.toContain('abc123')
    expect(text).not.toContain('a%40b.c')
  })

  it('never writes a secret: not a header, a cookie, a query value or a body field', async () => {
    const lines = captureConsole()
    const echo = handle(async (ctx) => jsonResponse({ length: (await ctx.request.text()).length }))
    await through(echo, '/api/thing?apiKey=qs-secret-1', {
      method: 'POST',
      body: { password: 'body-secret-2' },
      headers: { authorization: 'Bearer header-secret-3', cookie: 'sid=cookie-secret-4' },
    })
    // A real database error: Drizzle's message repeats the statement's parameters.
    const fail = handle(async (ctx) => {
      const row = { name: 'param-secret-5', status: 'active' as const }
      const now = new Date()
      await ctx.db.insert(entityTable).values({ id: 'dup', ...row, createdAt: now, updatedAt: now })
      await ctx.db.insert(entityTable).values({ id: 'dup', ...row, createdAt: now, updatedAt: now })
      return jsonResponse({})
    })
    const failed = await through(fail, '/api/thing?apiKey=qs-secret-1', {
      headers: { authorization: 'Bearer header-secret-3', cookie: 'sid=cookie-secret-4' },
    })
    const text = lines.join('\n')
    expect(failed.status).toBe(500)
    expect(text).toContain('"message":"request"')
    expect(text).toContain('UNIQUE constraint failed')
    expect(text).toContain('insert into')
    for (const secret of [
      'qs-secret-1',
      'body-secret-2',
      'header-secret-3',
      'cookie-secret-4',
      'param-secret-5',
    ]) {
      expect(text).not.toContain(secret)
    }
  })
})
