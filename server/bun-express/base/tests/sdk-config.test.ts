import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import request from 'supertest'

import { env } from '../src/config/env'
import { RATE_LIMITS } from '../src/config/constants'
import * as cache from '../src/services/cache'
import { app } from '../src/server'
import { resetStore } from './store'

const KEY = 'pk_test_a'
const OTHER_KEY = 'pk_test_b'
const A = 'https://a.example.test'
const B = 'https://b.example.test'
const C = 'https://c.example.test'
const PATH = '/api/sdk/v1/config'

type ErrorBody = { error: { code: string }; requestId: string }

const original = { keys: env.SDK_KEYS, enabled: env.SDK_ENABLED }

beforeEach(async () => {
  env.SDK_KEYS = new Map([
    [KEY, [A, B]],
    [OTHER_KEY, [C]],
  ])
  env.SDK_ENABLED = true
  await resetStore()
})

afterEach(() => {
  env.SDK_KEYS = original.keys
  env.SDK_ENABLED = original.enabled
})

// Every refusal is the server's own envelope, with the request id the response header carries.
function expectEnvelope(res: request.Response, status: number, code: string): void {
  const body = res.body as ErrorBody

  expect(res.status).toBe(status)
  expect(body.error.code).toBe(code)
  expect(body.requestId).toBeTruthy()
  expect(res.header['x-request-id']).toBe(body.requestId)
}

describe('GET /api/sdk/v1/config', () => {
  it('answers { enabled: true } to a listed origin with its key and echoes the origin', async () => {
    const res = await request(app).get(PATH).set('Origin', A).set('X-Sdk-Key', KEY)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ enabled: true })
    expect(res.header['access-control-allow-origin']).toBe(A)
    expect(res.header.vary).toContain('Origin')
  })

  it('echoes the origin of the request, not the first one the key lists', async () => {
    const res = await request(app).get(PATH).set('Origin', B).set('X-Sdk-Key', KEY)

    expect(res.status).toBe(200)
    expect(res.header['access-control-allow-origin']).toBe(B)
  })

  it('answers { enabled: false } when SDK_ENABLED is false: the kill switch', async () => {
    env.SDK_ENABLED = false

    const res = await request(app).get(PATH).set('Origin', A).set('X-Sdk-Key', KEY)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ enabled: false })
  })

  it('answers a valid key with no Origin (the frame, same origin) and sends no allow header', async () => {
    const res = await request(app).get(PATH).set('X-Sdk-Key', KEY)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ enabled: true })
    expect(res.header['access-control-allow-origin']).toBeUndefined()
  })

  it('answers a valid key with an Origin equal to the request host, with no allow-origin header', async () => {
    const res = await request(app)
      .get(PATH)
      .set('Host', 'api.example.test')
      .set('Origin', 'http://api.example.test')
      .set('X-Sdk-Key', KEY)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ enabled: true })
    expect(res.header['access-control-allow-origin']).toBeUndefined()
  })

  it('answers a valid key with Sec-Fetch-Site same-origin, whatever the Origin says (a proxy)', async () => {
    const res = await request(app)
      .get(PATH)
      .set('Origin', 'https://elsewhere.example.test')
      .set('Sec-Fetch-Site', 'same-origin')
      .set('X-Sdk-Key', KEY)

    expect(res.status).toBe(200)
    expect(res.header['access-control-allow-origin']).toBeUndefined()
  })

  it('does not take X-Forwarded-Host for the request host', async () => {
    const res = await request(app)
      .get(PATH)
      .set('Origin', 'https://evil.example.test')
      .set('X-Forwarded-Host', 'evil.example.test')
      .set('X-Sdk-Key', KEY)

    expectEnvelope(res, 403, 'forbidden')
  })

  it('answers 403 for a valid key, an unlisted Origin and Sec-Fetch-Site cross-site', async () => {
    const res = await request(app)
      .get(PATH)
      .set('Origin', C)
      .set('Sec-Fetch-Site', 'cross-site')
      .set('X-Sdk-Key', KEY)

    expectEnvelope(res, 403, 'forbidden')
  })

  it('answers 403 to a same-origin request with no key or an unknown key', async () => {
    const bare = await request(app).get(PATH).set('Sec-Fetch-Site', 'same-origin')
    const unknown = await request(app)
      .get(PATH)
      .set('Host', 'api.example.test')
      .set('Origin', 'http://api.example.test')
      .set('X-Sdk-Key', 'pk_unknown')

    expectEnvelope(bare, 403, 'forbidden')
    expectEnvelope(unknown, 403, 'forbidden')
  })

  it('answers 403 with no key', async () => {
    const res = await request(app).get(PATH).set('Origin', A)

    expectEnvelope(res, 403, 'forbidden')
  })

  it('answers 403 for an unknown key', async () => {
    const res = await request(app).get(PATH).set('Origin', A).set('X-Sdk-Key', 'pk_unknown')

    expectEnvelope(res, 403, 'forbidden')
  })

  it('answers 403 for an origin the key does not list, even one another key lists', async () => {
    const res = await request(app).get(PATH).set('Origin', C).set('X-Sdk-Key', KEY)

    expectEnvelope(res, 403, 'forbidden')
    expect(res.header['access-control-allow-origin']).toBeUndefined()
  })

  it('answers 403 for an unknown key with no Origin', async () => {
    const res = await request(app).get(PATH).set('X-Sdk-Key', 'pk_unknown')

    expectEnvelope(res, 403, 'forbidden')
  })

  it('refuses everything while SDK_KEYS is unset', async () => {
    env.SDK_KEYS = undefined

    const withKey = await request(app).get(PATH).set('Origin', A).set('X-Sdk-Key', KEY)
    const bare = await request(app).get(PATH)
    const preflight = await request(app)
      .options(PATH)
      .set('Origin', A)
      .set('Access-Control-Request-Method', 'GET')

    expectEnvelope(withKey, 403, 'forbidden')
    expectEnvelope(bare, 403, 'forbidden')
    expect(preflight.header['access-control-allow-origin']).toBeUndefined()
  })

  it('reads no cookie: a session cookie changes nothing', async () => {
    const cookie = 'access_token=abc; refresh_token=def'

    const allowed = await request(app)
      .get(PATH)
      .set('Origin', A)
      .set('X-Sdk-Key', KEY)
      .set('Cookie', cookie)
    const refused = await request(app).get(PATH).set('Origin', A).set('Cookie', cookie)

    expect(allowed.status).toBe(200)
    expect(allowed.body).toEqual({ enabled: true })
    expectEnvelope(refused, 403, 'forbidden')
  })

  it('never sends Access-Control-Allow-Credentials, on a success, a refusal or a preflight', async () => {
    const responses = [
      await request(app).get(PATH).set('Origin', A).set('X-Sdk-Key', KEY),
      await request(app).get(PATH).set('Origin', C).set('X-Sdk-Key', KEY),
      await request(app).get(PATH).set('Origin', A),
      await request(app).options(PATH).set('Origin', A).set('Access-Control-Request-Method', 'GET'),
    ]

    for (const res of responses) {
      expect(res.header['access-control-allow-credentials']).toBeUndefined()
    }
  })

  it('does not answer a non-GET method with the config', async () => {
    const res = await request(app).post(PATH).set('Origin', A).set('X-Sdk-Key', KEY)

    expect(res.status).toBe(404)
  })

  it('answers the 404 envelope for an unknown path in the namespace, once the gate admits it', async () => {
    const admitted = await request(app)
      .get('/api/sdk/v1/nothing-here')
      .set('Origin', A)
      .set('X-Sdk-Key', KEY)
    const refused = await request(app).get('/api/sdk/v1/nothing-here')

    expectEnvelope(admitted, 404, 'not_found')
    expectEnvelope(refused, 403, 'forbidden')
  })

  it('gates a case variant of the path as it gates the path itself', async () => {
    const res = await request(app).get('/API/SDK/V1/config')

    expectEnvelope(res, 403, 'forbidden')
  })
})

describe('the preflight of /api/sdk/v1', () => {
  it('answers a listed origin with the allow headers, a 600 second max age and no body', async () => {
    const res = await request(app)
      .options(PATH)
      .set('Origin', A)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'x-sdk-key')

    expect(res.status).toBe(204)
    expect(res.header['access-control-allow-origin']).toBe(A)
    expect(res.header.vary).toContain('Origin')
    expect(res.header['access-control-max-age']).toBe('600')
    expect(res.header['access-control-allow-headers']).toBe('x-sdk-key, content-type')
    expect(res.header['access-control-allow-methods']).toBe('GET, POST')
    expect(res.text).toBe('')
  })

  it('carries no key and is not refused for it', async () => {
    const res = await request(app)
      .options(PATH)
      .set('Origin', B)
      .set('Access-Control-Request-Method', 'GET')

    expect(res.status).toBe(204)
    expect(res.header['access-control-allow-origin']).toBe(B)
  })

  it('names no allow header for an unlisted origin', async () => {
    const res = await request(app)
      .options(PATH)
      .set('Origin', 'https://evil.example.test')
      .set('Access-Control-Request-Method', 'GET')

    expect(res.status).toBe(204)
    expect(res.header['access-control-allow-origin']).toBeUndefined()
    expect(res.header['access-control-allow-headers']).toBeUndefined()
    expect(res.header['access-control-max-age']).toBeUndefined()
    expect(res.header.vary).toContain('Origin')
  })

  it('does not treat an OPTIONS without a preflight request method as one', async () => {
    const res = await request(app).options(PATH).set('Origin', A)

    expectEnvelope(res, 403, 'forbidden')
  })
})

describe('outside the namespace', () => {
  it('carries no cross-origin header on /api/health from a listed origin', async () => {
    const res = await request(app).get('/api/health').set('Origin', A)

    expect(res.status).toBe(200)
    expect(res.header['access-control-allow-origin']).toBeUndefined()
  })

  it('answers no preflight on /api/health', async () => {
    const res = await request(app)
      .options('/api/health')
      .set('Origin', A)
      .set('Access-Control-Request-Method', 'GET')

    expect(res.header['access-control-allow-origin']).toBeUndefined()
  })
})

describe('the rate limit of /api/sdk/v1', () => {
  it('answers 429 past the limit by address, with the envelope and Retry-After', async () => {
    const limit = RATE_LIMITS.sdkPerIp.limit * env.RATE_LIMIT_SCALE
    const send = () => request(app).get(PATH).set('Origin', A).set('X-Sdk-Key', KEY)

    for (let i = 0; i < limit; i++) expect((await send()).status).toBe(200)
    const res = await send()

    expectEnvelope(res, 429, 'rate_limited')
    expect(res.header['retry-after']).toBeTruthy()
    expect(res.header['access-control-allow-origin']).toBe(A)
  })

  it('counts by key as well: one key over its limit is refused, another is not', async () => {
    const incr = spyOn(cache, 'incr').mockImplementation((key: string) =>
      Promise.resolve(key.startsWith('rl:sdkPerKey:') ? Number.MAX_SAFE_INTEGER : 1),
    )

    try {
      const res = await request(app).get(PATH).set('Origin', A).set('X-Sdk-Key', KEY)

      expectEnvelope(res, 429, 'rate_limited')
      expect(incr).toHaveBeenCalled()
    } finally {
      incr.mockRestore()
    }
  })

  it('does not count a refused request against the limit', async () => {
    const incr = spyOn(cache, 'incr')

    try {
      await request(app).get(PATH).set('Origin', A)
      await request(app).get(PATH).set('Origin', A).set('X-Sdk-Key', 'pk_unknown')

      expect(incr).not.toHaveBeenCalled()
    } finally {
      incr.mockRestore()
    }
  })
})
