import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { MAX_BODY_BYTES } from '../../server/config/constants'
import { handle, json as jsonResponse } from '../../server/middleware/handler'
import { readInput, validate } from '../../server/middleware/validate'
import { AppError } from '../../server/services/utils/error'
import { json, send, through } from './helpers'

const Greeting = z.object({ name: z.string().min(1) })
const greetRequest = { body: Greeting }

const probe = {
  greet: handle(validate(greetRequest), (ctx) => {
    const { body } = readInput(ctx, greetRequest)
    return jsonResponse({ greeting: `hello ${body.name}` }, 201)
  }),
  missing: handle(() => {
    throw new AppError('not_found', 'thing 7 not found')
  }),
  slowDown: handle(() => {
    throw new AppError('rate_limited', 'too many requests', undefined, {
      headers: { 'Retry-After': '7' },
    })
  }),
  boom: handle(() => {
    throw new Error('connection string leaked here')
  }),
  zod: handle(() => {
    z.object({ id: z.string() }).parse({})
    return jsonResponse({})
  }),
}

type Envelope = {
  error: { code: string; message: string; details?: { path: string }[] }
  requestId: string
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('a route', () => {
  it('sends its response with the status it chose', async () => {
    const res = await through(probe.greet, '/probe', { method: 'POST', body: { name: 'ada' } })
    expect(res.status).toBe(201)
    expect(await json(res)).toEqual({ greeting: 'hello ada' })
  })

  it('rejects an invalid body with the validation envelope naming the field', async () => {
    const res = await through(probe.greet, '/probe', { method: 'POST', body: { name: '' } })
    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await json<Envelope>(res)).toMatchObject({
      error: { code: 'validation_failed', message: 'invalid body', details: [{ path: 'name' }] },
      requestId: res.headers.get('x-request-id'),
    })
  })
})

describe('the error handler', () => {
  it('turns malformed JSON into a 400 envelope', async () => {
    const res = await through(probe.greet, '/probe', { method: 'POST', body: '{not json' })
    expect(res.status).toBe(400)
    expect(await json<Envelope>(res)).toMatchObject({
      error: { code: 'validation_failed', message: 'malformed JSON body' },
    })
  })

  it('refuses a JSON body sent as text/plain or with no Content-Type', async () => {
    const body = JSON.stringify({ name: 'ada' })
    const plain = await through(probe.greet, '/probe', {
      method: 'POST',
      body,
      headers: { 'content-type': 'text/plain' },
    })
    const bare = await through(probe.greet, '/probe', {
      method: 'POST',
      body,
      headers: { 'content-type': '' },
    })
    // A body not declared as JSON is ignored, so validation sees none.
    for (const res of [plain, bare]) {
      expect(res.status).toBe(400)
      expect(await json<Envelope>(res)).toMatchObject({
        error: { code: 'validation_failed', message: 'invalid body' },
      })
    }
  })

  it('turns an oversized body into a 413 envelope', async () => {
    const res = await through(probe.greet, '/probe', {
      method: 'POST',
      body: { name: 'x'.repeat(MAX_BODY_BYTES + 1) },
    })
    expect(res.status).toBe(413)
    expect(await json<Envelope>(res)).toMatchObject({ error: { code: 'payload_too_large' } })
  })

  it('maps an AppError to its status and code', async () => {
    const res = await through(probe.missing, '/probe')
    expect(res.status).toBe(404)
    expect(await json(res)).toEqual({
      error: { code: 'not_found', message: 'thing 7 not found' },
      requestId: res.headers.get('x-request-id'),
    })
  })

  it('maps a ZodError that escaped a handler to a 400', async () => {
    const res = await through(probe.zod, '/probe')
    expect(res.status).toBe(400)
    expect(await json<Envelope>(res)).toMatchObject({
      error: { code: 'validation_failed', details: [{ path: 'id' }] },
    })
  })

  it('applies the headers of an AppError and keeps the envelope unchanged', async () => {
    const res = await through(probe.slowDown, '/probe')
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('7')
    expect(await json(res)).toEqual({
      error: { code: 'rate_limited', message: 'too many requests' },
      requestId: res.headers.get('x-request-id'),
    })
  })

  it('sends no extra header with an AppError that carries none', async () => {
    const res = await through(probe.missing, '/probe')
    expect(res.headers.get('retry-after')).toBeNull()
    expect(res.headers.get('allow')).toBeNull()
  })

  it('hides an unexpected error behind a bare internal envelope and logs it with its stack', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const res = await through(probe.boom, '/probe')
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({
      error: { code: 'internal', message: 'unexpected error' },
      requestId: res.headers.get('x-request-id'),
    })
    expect(text).not.toContain('connection string')
    expect(error).toHaveBeenCalledTimes(1)
    const line = JSON.parse(String(error.mock.calls[0]?.[0])) as {
      requestId: string
      error: { message: string; stack: string }
    }
    expect(line.requestId).toBe(res.headers.get('x-request-id'))
    expect(line.error.message).toContain('connection string')
    expect(line.error.stack).toContain('Error')
  })

  it('answers a bare 500 when the configuration is invalid, and names the variable in the log only', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const res = await through(probe.missing, '/probe', {
      bindings: { ENVIRONMENT: 'production', ENCRYPTION_KEY: 'a-bad-key-value' },
    })
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain('ENCRYPTION_KEY')
    expect(JSON.parse(text)).toMatchObject({ error: { code: 'internal' } })
    expect(String(error.mock.calls[0]?.[0])).toContain('ENCRYPTION_KEY')
    expect(String(error.mock.calls[0]?.[0])).not.toContain('a-bad-key-value')
  })
})

describe('routing', () => {
  it('answers an unknown API path with the not_found envelope', async () => {
    const res = await send('/api/nope/deeper')
    expect(res.status).toBe(404)
    expect(await json<Envelope>(res)).toMatchObject({
      error: { code: 'not_found' },
      requestId: res.headers.get('x-request-id'),
    })
  })

  it('answers an unsupported method with the 405 envelope and an Allow header', async () => {
    const res = await send('/api/health', { method: 'DELETE' })
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET')
    expect(await json<Envelope>(res)).toMatchObject({ error: { code: 'method_not_allowed' } })

    const module = await send('/api/module', { method: 'PUT', body: {} })
    expect(module.status).toBe(405)
    expect(module.headers.get('allow')).toBe('GET, POST')
  })

  it('hands a path outside /api to the assets, untouched: no request id, none of the API headers', async () => {
    // @frontends-start
    // Beside several frontends the host picks the folder: a frontend's own host, not an unnamed one.
    const host = `${(JSON.parse('__FRONTENDS__') as { dir: string }[])[0]?.dir ?? ''}.localhost`
    const res = await send('/no-such-page', { host })
    // @frontends-end
    // @nofrontends-start
    const res = await send('/no-such-page')
    // @nofrontends-end
    expect(res.status).toBe(404)
    expect(res.headers.get('x-request-id')).toBeNull()
    // A built dist/ may answer with the page's own policy; the API's is never on a page.
    expect(res.headers.get('content-security-policy') ?? '').not.toContain("default-src 'none'")
    expect(res.headers.get('content-type') ?? '').not.toContain('application/json')
  })

  it('still routes a supported method to its handler', async () => {
    expect((await send('/api/health')).status).toBe(200)
  })
})
