// The SDK namespace /api/sdk/v1: the gate (CORS for this namespace alone, the key, the rate limit)
// and its one endpoint, GET /api/sdk/v1/config. Every request goes through the Worker's own app
// with the SDK variables a test sets; every refusal is the server's envelope with a request id.
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import { RATE_LIMITS } from '../../server/config/constants'
import { sha256 } from '../../server/services/security/crypto'
import { json, served } from './helpers'
import { A, B, C, KEY_A, KEY_B, sdkAssets, sdkBindings } from './sdk-assets'

const PATH = '/api/sdk/v1/config'

type ErrorBody = { error: { code: string }; requestId: string }

const withKey = (origin: string | undefined, key = KEY_A) => ({
  headers: { ...(origin === undefined ? {} : { Origin: origin }), 'X-Sdk-Key': key },
})
const get = (headers: Record<string, string>, bindings = sdkBindings()) =>
  served(PATH, { headers, bindings })

// Every refusal is the server's own envelope, with the request id the response header carries.
async function expectEnvelope(res: Response, status: number, code: string): Promise<void> {
  const body = await json<ErrorBody>(res)

  expect(res.status).toBe(status)
  expect(body.error.code).toBe(code)
  expect(body.requestId).toBeTruthy()
  expect(res.headers.get('x-request-id')).toBe(body.requestId)
}

describe('GET /api/sdk/v1/config', () => {
  it('answers { enabled: true } to a listed origin with its key and echoes the origin', async () => {
    const res = await served(PATH, { ...withKey(A), bindings: sdkBindings() })

    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ enabled: true })
    expect(res.headers.get('access-control-allow-origin')).toBe(A)
    expect(res.headers.get('vary')).toContain('Origin')
  })

  it('echoes the origin of the request, not the first one the key lists', async () => {
    const res = await served(PATH, { ...withKey(B), bindings: sdkBindings() })

    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe(B)
  })

  it('answers { enabled: false } when SDK_ENABLED is false: the kill switch', async () => {
    const res = await served(PATH, {
      ...withKey(A),
      bindings: sdkBindings({ SDK_ENABLED: 'false' }),
    })

    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ enabled: false })
  })

  it('answers a valid key with no Origin (the frame, same origin) and sends no allow header', async () => {
    const res = await served(PATH, { ...withKey(undefined), bindings: sdkBindings() })

    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ enabled: true })
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('answers a valid key with an Origin equal to the request host, with no allow-origin header', async () => {
    const res = await served(PATH, {
      ...withKey('http://api.example.test'),
      host: 'api.example.test',
      bindings: sdkBindings(),
    })

    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ enabled: true })
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('answers a valid key with Sec-Fetch-Site same-origin, whatever the Origin says (a proxy)', async () => {
    const res = await get({
      Origin: 'https://elsewhere.example.test',
      'Sec-Fetch-Site': 'same-origin',
      'X-Sdk-Key': KEY_A,
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('does not take X-Forwarded-Host for the request host', async () => {
    const res = await get({
      Origin: 'https://evil.example.test',
      'X-Forwarded-Host': 'evil.example.test',
      'X-Sdk-Key': KEY_A,
    })

    await expectEnvelope(res, 403, 'forbidden')
  })

  it('answers 403 for a valid key, an unlisted Origin and Sec-Fetch-Site cross-site', async () => {
    const res = await get({ Origin: C, 'Sec-Fetch-Site': 'cross-site', 'X-Sdk-Key': KEY_A })

    await expectEnvelope(res, 403, 'forbidden')
  })

  it('answers 403 to a same-origin request with no key or an unknown key', async () => {
    const bare = await get({ 'Sec-Fetch-Site': 'same-origin' })
    const unknown = await served(PATH, {
      ...withKey('http://api.example.test', 'pk_unknown'),
      host: 'api.example.test',
      bindings: sdkBindings(),
    })

    await expectEnvelope(bare, 403, 'forbidden')
    await expectEnvelope(unknown, 403, 'forbidden')
  })

  it('answers 403 with no key', async () => {
    await expectEnvelope(await get({ Origin: A }), 403, 'forbidden')
  })

  it('answers 403 for an unknown key', async () => {
    await expectEnvelope(await get({ Origin: A, 'X-Sdk-Key': 'pk_unknown' }), 403, 'forbidden')
  })

  it('answers 403 for an origin the key does not list, even one another key lists', async () => {
    const res = await served(PATH, { ...withKey(C), bindings: sdkBindings() })

    await expectEnvelope(res, 403, 'forbidden')
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('answers 403 for an unknown key with no Origin', async () => {
    await expectEnvelope(await get({ 'X-Sdk-Key': 'pk_unknown' }), 403, 'forbidden')
  })

  it('answers 403 for an empty key', async () => {
    await expectEnvelope(await get({ Origin: A, 'X-Sdk-Key': '' }), 403, 'forbidden')
  })

  it('refuses everything while SDK_KEYS is unset', async () => {
    const bindings = sdkBindings({}, null)

    const keyed = await get({ Origin: A, 'X-Sdk-Key': KEY_A }, bindings)
    const bare = await get({}, bindings)
    const preflight = await served(PATH, {
      method: 'OPTIONS',
      headers: { Origin: A, 'Access-Control-Request-Method': 'GET' },
      bindings,
    })

    await expectEnvelope(keyed, 403, 'forbidden')
    await expectEnvelope(bare, 403, 'forbidden')
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('reads no cookie: a session cookie changes nothing', async () => {
    const cookie = 'access_token=abc; refresh_token=def'

    const allowed = await get({ Origin: A, 'X-Sdk-Key': KEY_A, Cookie: cookie })
    const refused = await get({ Origin: A, Cookie: cookie })

    expect(allowed.status).toBe(200)
    expect(await json(allowed)).toEqual({ enabled: true })
    await expectEnvelope(refused, 403, 'forbidden')
  })

  it('never sends Access-Control-Allow-Credentials, on a success, a refusal or a preflight', async () => {
    const responses = [
      await get({ Origin: A, 'X-Sdk-Key': KEY_A }),
      await get({ Origin: C, 'X-Sdk-Key': KEY_A }),
      await get({ Origin: A }),
      await served(PATH, {
        method: 'OPTIONS',
        headers: { Origin: A, 'Access-Control-Request-Method': 'GET' },
        bindings: sdkBindings(),
      }),
    ]

    for (const res of responses) {
      expect(res.headers.get('access-control-allow-credentials')).toBeNull()
    }
  })

  it('answers a method it lacks with 405 and Allow, once the gate admits it', async () => {
    const admitted = await served(PATH, { ...withKey(A), method: 'POST', bindings: sdkBindings() })
    const refused = await served(PATH, { method: 'POST', bindings: sdkBindings() })

    await expectEnvelope(admitted, 405, 'method_not_allowed')
    expect(admitted.headers.get('allow')).toBe('GET')
    await expectEnvelope(refused, 403, 'forbidden')
  })

  it('answers the 404 envelope for an unknown path in the namespace, once the gate admits it', async () => {
    const admitted = await served('/api/sdk/v1/nothing-here', {
      ...withKey(A),
      bindings: sdkBindings(),
    })
    const refused = await served('/api/sdk/v1/nothing-here', { bindings: sdkBindings() })

    await expectEnvelope(admitted, 404, 'not_found')
    await expectEnvelope(refused, 403, 'forbidden')
  })

  it('does not answer a case variant of the path with the config', async () => {
    const assets = sdkAssets()

    const res = await served('/API/SDK/V1/config', {
      ...withKey(A),
      bindings: sdkBindings({ ASSETS: assets.fetcher }),
    })

    expect(res.status).toBe(404)
    expect(await res.text()).not.toContain('enabled')
  })
})

describe('the preflight of /api/sdk/v1', () => {
  const preflight = (origin: string, extra: Record<string, string> = {}) =>
    served(PATH, {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', ...extra },
      bindings: sdkBindings(),
    })

  it('answers a listed origin with the allow headers, a 600 second max age and no body', async () => {
    const res = await preflight(A, { 'Access-Control-Request-Headers': 'x-sdk-key' })

    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe(A)
    expect(res.headers.get('vary')).toContain('Origin')
    expect(res.headers.get('access-control-max-age')).toBe('600')
    expect(res.headers.get('access-control-allow-headers')).toBe('x-sdk-key, content-type')
    expect(res.headers.get('access-control-allow-methods')).toBe('GET, POST')
    expect(await res.text()).toBe('')
  })

  it('carries no key and is not refused for it', async () => {
    const res = await preflight(B)

    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe(B)
  })

  it('names no allow header for an unlisted origin', async () => {
    const res = await preflight('https://evil.example.test')

    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(res.headers.get('access-control-allow-headers')).toBeNull()
    expect(res.headers.get('access-control-max-age')).toBeNull()
    expect(res.headers.get('vary')).toContain('Origin')
  })

  it('does not treat an OPTIONS without a preflight request method as one', async () => {
    const res = await served(PATH, {
      method: 'OPTIONS',
      headers: { Origin: A },
      bindings: sdkBindings(),
    })

    await expectEnvelope(res, 403, 'forbidden')
  })
})

describe('outside the namespace', () => {
  it('carries no cross-origin header on /api/health from a listed origin', async () => {
    const res = await served('/api/health', { headers: { Origin: A }, bindings: sdkBindings() })

    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('answers no preflight on /api/health', async () => {
    const res = await served('/api/health', {
      method: 'OPTIONS',
      headers: { Origin: A, 'Access-Control-Request-Method': 'GET' },
      bindings: sdkBindings(),
    })

    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('the rate limit of /api/sdk/v1', () => {
  const rows = async () => {
    const { results } = await env.DB.prepare('SELECT key, count FROM rate_limit').all<{
      key: string
      count: number
    }>()
    return results
  }

  it('answers 429 past the limit by address, with the envelope and Retry-After', async () => {
    const limit = RATE_LIMITS.sdkPerIp.limit
    const send = () => get({ Origin: A, 'X-Sdk-Key': KEY_A, 'CF-Connecting-IP': '203.0.113.7' })

    for (let i = 0; i < limit; i++) expect((await send()).status).toBe(200)
    const res = await send()

    await expectEnvelope(res, 429, 'rate_limited')
    expect(res.headers.get('retry-after')).toBeTruthy()
    expect(res.headers.get('access-control-allow-origin')).toBe(A)
  })

  it('counts by key as well: one key over its limit is refused, another is not', async () => {
    const now = Date.now()
    const id = `sdkPerKey:${await sha256(KEY_A)}`
    await env.DB.prepare(
      'INSERT INTO rate_limit (key, window_start, expires_at, count) VALUES (?, ?, ?, ?)',
    )
      .bind(id, now, now + 60_000, RATE_LIMITS.sdkPerKey.limit)
      .run()

    const over = await get({ Origin: A, 'X-Sdk-Key': KEY_A })
    const other = await get({ Origin: C, 'X-Sdk-Key': KEY_B })

    await expectEnvelope(over, 429, 'rate_limited')
    expect(other.status).toBe(200)
  })

  it('does not count a refused request against the limit', async () => {
    await get({ Origin: A })
    await get({ Origin: A, 'X-Sdk-Key': 'pk_unknown' })
    await get({ Origin: C, 'X-Sdk-Key': KEY_A })

    expect(await rows()).toEqual([])
  })
})
