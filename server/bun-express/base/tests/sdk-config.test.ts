import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import express from 'express'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'

import sdkRoutes from '../src/api/sdk/routes'
import { env } from '../src/config/env'
import { RATE_LIMITS } from '../src/config/constants'
import { memory } from '../src/infra/memory'
import { errorHandler } from '../src/middleware/error-handler'
import { requestId } from '../src/middleware/request-id'
import * as cache from '../src/services/cache'
import * as sdkKeys from '../src/services/security/sdk-keys'
import { app, createApp } from '../src/server'

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
  // The rate limits count in the cache; these suites keep no records, so the store is left alone.
  await memory.close()
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

  it('does not take a request that says cross-site for same-origin, even without an Origin', async () => {
    const res = await request(app)
      .get(PATH)
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

// The project's own CORS_ORIGINS layer sits in front of the whole app: it must leave /api/sdk/ alone.
describe('with CORS_ORIGINS set', () => {
  const APP = 'https://app.example.test'
  let root: string
  let corsApp: ReturnType<typeof createApp>

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'sdk-cors-'))
    mkdirSync(join(root, 'v1'))
    writeFileSync(join(root, 'v1', 'loader.js'), 'x')
    writeFileSync(join(root, 'v1', 'frame.html'), '<!doctype html>')
    corsApp = createApp(undefined, root, { origin: [APP], credentials: true })
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const preflight = (origin: string) =>
    request(corsApp)
      .options(PATH)
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'x-sdk-key')

  it('answers the SDK preflight itself when CORS_ORIGINS is set', async () => {
    const res = await preflight(A)

    expect(res.status).toBe(204)
    expect(res.header['access-control-allow-origin']).toBe(A)
    expect(res.header['access-control-max-age']).toBe('600')
  })

  it('sends no Allow-Credentials on the namespace when CORS_ORIGINS is set', async () => {
    const ok = await request(corsApp).get(PATH).set('Origin', A).set('X-Sdk-Key', KEY)
    const refused = await request(corsApp).get(PATH).set('Origin', A)

    expect(ok.status).toBe(200)
    expect(refused.status).toBe(403)
    for (const res of [ok, refused, await preflight(A)]) {
      expect(res.header['access-control-allow-credentials']).toBeUndefined()
    }
  })

  it('gives an origin that is only in CORS_ORIGINS nothing on the namespace', async () => {
    const res = await request(corsApp).get(PATH).set('Origin', APP).set('X-Sdk-Key', KEY)
    const pre = await preflight(APP)

    expectEnvelope(res, 403, 'forbidden')
    for (const reply of [res, pre]) {
      expect(reply.header['access-control-allow-origin']).toBeUndefined()
      expect(reply.header['access-control-allow-credentials']).toBeUndefined()
    }
  })

  it('sends no Allow-Credentials on the files and the frame when CORS_ORIGINS is set', async () => {
    const file = await request(corsApp).get('/api/sdk/dist/v1/loader.js').set('Origin', APP)
    const frame = await request(corsApp)
      .get('/api/sdk/frame/v1?k=' + KEY)
      .set('Origin', APP)

    expect(file.status).toBe(200)
    expect(frame.status).toBe(200)
    expect(file.header['access-control-allow-credentials']).toBeUndefined()
    expect(frame.header['access-control-allow-credentials']).toBeUndefined()
  })

  it('leaves CORS_ORIGINS as it was outside the SDK paths', async () => {
    const res = await request(corsApp).get('/api/health').set('Origin', APP)

    expect(res.header['access-control-allow-origin']).toBe(APP)
    expect(res.header['access-control-allow-credentials']).toBe('true')
  })
})

// The same gate on a bare app, behind a proxy hop, so two addresses can be told apart.
function gateApp() {
  const bare = express()
  bare.set('trust proxy', true)
  bare.use(requestId)
  bare.use('/api/sdk/v1', sdkRoutes)
  bare.use(errorHandler)
  return bare
}

describe('the limits of /api/sdk/v1', () => {
  // Counts like the real limiter, with the address counters two requests below their limit.
  function spyLimits() {
    const counts = new Map<string, number>()
    const calls = { key: 0 }
    const incr = spyOn(cache, 'incr').mockImplementation((name: string) => {
      const next = (counts.get(name) ?? 0) + 1
      counts.set(name, next)
      if (name.startsWith('rl:sdkPerKey:')) calls.key++
      const offset = name.startsWith('rl:sdkPerIp:') ? RATE_LIMITS.sdkPerIp.limit - 2 : 0
      return Promise.resolve(next + offset)
    })
    return { incr, calls }
  }

  it('one address cannot use up a key limit', async () => {
    const { incr, calls } = spyLimits()
    const bare = gateApp()
    const from = (ip: string) =>
      request(bare).get(PATH).set('X-Forwarded-For', ip).set('Origin', A).set('X-Sdk-Key', KEY)

    try {
      const statuses = []
      for (let i = 0; i < 6; i++) statuses.push((await from('203.0.113.1')).status)

      expect(statuses).toEqual([200, 200, 429, 429, 429, 429])
      expect(calls.key).toBe(2)
      expect((await from('203.0.113.2')).status).toBe(200)
      expect(calls.key).toBe(3)
    } finally {
      incr.mockRestore()
    }
  })

  it('limits preflights by address', async () => {
    const { incr } = spyLimits()
    const listed = spyOn(sdkKeys, 'isListedOrigin')
    const bare = gateApp()
    const pre = () =>
      request(bare)
        .options(PATH)
        .set('X-Forwarded-For', '203.0.113.1')
        .set('Origin', A)
        .set('Access-Control-Request-Method', 'GET')

    try {
      expect((await pre()).status).toBe(204)
      expect((await pre()).status).toBe(204)
      const refused = await pre()

      expectEnvelope(refused, 429, 'rate_limited')
      expect(refused.header['access-control-allow-origin']).toBeUndefined()
      expect(refused.header['access-control-allow-methods']).toBeUndefined()
      expect(refused.header['access-control-max-age']).toBeUndefined()
      expect(listed).toHaveBeenCalledTimes(2)
    } finally {
      listed.mockRestore()
      incr.mockRestore()
    }
  })
})

describe('the answers of /api/sdk/v1', () => {
  it('never lets a namespace answer be stored', async () => {
    const ok = await request(app).get(PATH).set('Origin', A).set('X-Sdk-Key', KEY)
    const refused = await request(app).get(PATH).set('Origin', A)
    const pre = await request(app)
      .options(PATH)
      .set('Origin', A)
      .set('Access-Control-Request-Method', 'GET')
    const incr = spyOn(cache, 'incr').mockImplementation(() =>
      Promise.resolve(Number.MAX_SAFE_INTEGER),
    )
    let limited: request.Response
    try {
      limited = await request(app).get(PATH).set('Origin', A).set('X-Sdk-Key', KEY)
    } finally {
      incr.mockRestore()
    }

    expect(limited.status).toBe(429)
    for (const res of [ok, refused, limited, pre]) {
      expect(res.header['cache-control']).toBe('no-store')
      expect(res.header.vary).toContain('Origin')
      expect(res.header.vary).toContain('X-Sdk-Key')
    }
  })
})

describe('a key the resolver reports disabled, and a lookup that fails', () => {
  it('answers { enabled: false } on config to a listed origin, with the allow header', async () => {
    const resolve = spyOn(sdkKeys, 'resolveKey').mockResolvedValue({ origins: [A], enabled: false })

    try {
      const res = await request(app).get(PATH).set('Origin', A).set('X-Sdk-Key', KEY)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ enabled: false })
      expect(res.header['access-control-allow-origin']).toBe(A)
    } finally {
      resolve.mockRestore()
    }
  })

  it('still refuses a disabled key from an origin it does not list', async () => {
    const resolve = spyOn(sdkKeys, 'resolveKey').mockResolvedValue({ origins: [A], enabled: false })

    try {
      const res = await request(app).get(PATH).set('Origin', C).set('X-Sdk-Key', KEY)

      expectEnvelope(res, 403, 'forbidden')
    } finally {
      resolve.mockRestore()
    }
  })

  it('refuses a disabled key on every other endpoint of the namespace', async () => {
    const resolve = spyOn(sdkKeys, 'resolveKey').mockResolvedValue({ origins: [A], enabled: false })

    try {
      const res = await request(app)
        .get('/api/sdk/v1/nothing-here')
        .set('Origin', A)
        .set('X-Sdk-Key', KEY)

      expectEnvelope(res, 403, 'forbidden')
      expect(res.header['access-control-allow-origin']).toBeUndefined()
    } finally {
      resolve.mockRestore()
    }
  })

  it('answers config for a disabled key to GET and HEAD on the exact path only', async () => {
    const resolve = spyOn(sdkKeys, 'resolveKey').mockResolvedValue({ origins: [A], enabled: false })
    const send = (method: 'post' | 'put' | 'get' | 'head', path: string) =>
      request(app)[method](path).set('Origin', A).set('X-Sdk-Key', KEY)

    try {
      const head = await send('head', PATH)
      const refused = [
        await send('post', PATH),
        await send('put', PATH),
        await send('get', PATH + '/'),
        await send('get', '/api/sdk/v1/Config'),
      ]

      expect(head.status).toBe(200)
      for (const res of refused) {
        expectEnvelope(res, 403, 'forbidden')
        expect(res.header['access-control-allow-origin']).toBeUndefined()
      }
    } finally {
      resolve.mockRestore()
    }
  })

  it('answers { enabled: false } for an enabled key while SDK_ENABLED is false', async () => {
    env.SDK_ENABLED = false

    const res = await request(app).get(PATH).set('Origin', A).set('X-Sdk-Key', KEY)

    expect(res.body).toEqual({ enabled: false })
  })

  it('answers the 500 envelope with no allow header when the lookup throws', async () => {
    const resolve = spyOn(sdkKeys, 'resolveKey').mockRejectedValue(new Error('lookup down'))
    const logged = spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      const res = await request(app).get(PATH).set('Origin', A).set('X-Sdk-Key', KEY)
      const same = await request(app)
        .get(PATH)
        .set('Sec-Fetch-Site', 'same-origin')
        .set('X-Sdk-Key', KEY)

      expectEnvelope(res, 500, 'internal')
      expectEnvelope(same, 500, 'internal')
      expect(res.header['access-control-allow-origin']).toBeUndefined()
      expect(JSON.stringify(res.body)).not.toContain('lookup down')
    } finally {
      resolve.mockRestore()
      logged.mockRestore()
    }
  })

  it('answers a preflight whose origin lookup fails with the 500 envelope and no allow header', async () => {
    const listed = spyOn(sdkKeys, 'isListedOrigin').mockRejectedValue(new Error('lookup down'))
    const logged = spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      const res = await request(app)
        .options(PATH)
        .set('Origin', A)
        .set('Access-Control-Request-Method', 'GET')

      expectEnvelope(res, 500, 'internal')
      expect(res.header['access-control-allow-origin']).toBeUndefined()
      expect(res.header['access-control-allow-methods']).toBeUndefined()
      expect(JSON.stringify(res.body)).not.toContain('lookup down')
    } finally {
      listed.mockRestore()
      logged.mockRestore()
    }
  })

  it('resolves the key once per request', async () => {
    const resolve = spyOn(sdkKeys, 'resolveKey')

    try {
      await request(app).get(PATH).set('Origin', A).set('X-Sdk-Key', KEY)

      expect(resolve).toHaveBeenCalledTimes(1)
    } finally {
      resolve.mockRestore()
    }
  })
})
