// What the gate, `/config` and the frame document do with the record the resolver answers: a key
// that is switched off, a lookup that throws, and the kill switch beside an enabled key. The
// resolver is replaced by a lookup the test controls, as a product that stores keys would.
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as keys from '../../server/services/security/sdk-keys'
import { RATE_LIMITS } from '../../server/config/constants'
import { json, served } from './helpers'
import { A, B, KEY_A, sdkBindings } from './sdk-assets'

afterEach(() => {
  vi.restoreAllMocks()
})

const CONFIG = '/api/sdk/v1/config'
const TELEMETRY = '/api/sdk/v1/telemetry'
const keyed = { Origin: A, 'X-Sdk-Key': KEY_A }

const record = (enabled: boolean) =>
  vi.spyOn(keys, 'resolveKey').mockResolvedValue({ origins: [A], enabled })
const disabled = () => record(false)
const broken = () => {
  vi.spyOn(keys, 'resolveKey').mockRejectedValue(new Error('lookup is down'))
  vi.spyOn(keys, 'isListedOrigin').mockRejectedValue(new Error('lookup is down'))
}

const frameDocument = (key = KEY_A) => {
  const assets = { fetch: () => Promise.resolve(new Response('<title>frame</title>')) }
  return served(`/api/sdk/frame/v1?k=${key}`, { bindings: sdkBindings({ ASSETS: assets }) })
}
const ancestors = (res: Response) =>
  /frame-ancestors (.*)$/.exec(res.headers.get('content-security-policy') ?? '')?.[1]

describe('a throwing lookup', () => {
  it('answers the 500 envelope on the namespace with no allow-origin header', async () => {
    broken()

    const res = await served(CONFIG, { headers: keyed, bindings: sdkBindings() })
    const body = await json<{ error: { code: string }; requestId: string }>(res)

    expect(res.status).toBe(500)
    expect(body.error.code).toBe('internal')
    expect(body.requestId).toBe(res.headers.get('x-request-id'))
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('is not read as a listed origin on a preflight either', async () => {
    broken()

    const res = await served(CONFIG, {
      method: 'OPTIONS',
      headers: { Origin: A, 'Access-Control-Request-Method': 'GET' },
      bindings: sdkBindings(),
    })

    expect(res.status).toBe(500)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(await res.text()).not.toContain('lookup is down')
  })

  it("answers the frame document with frame-ancestors 'none'", async () => {
    broken()

    const res = await frameDocument()

    expect(res.status).toBe(200)
    expect(ancestors(res)).toBe("'none'")
  })

  it('logs the failed frame lookup as a warning with the request id and no error text', async () => {
    broken()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const res = await frameDocument()

    const lines = warn.mock.calls.map((call) => String(call[0]))
    warn.mockRestore()
    const line = lines.find((text) => text.includes('"level":"warn"')) ?? ''
    expect(line).toContain(`"requestId":"${res.headers.get('x-request-id') ?? '?'}"`)
    expect(lines.join('')).not.toContain('lookup is down')
    expect(lines.join('')).not.toContain('stack')
  })
})

describe('a record whose origins leave the closed form', () => {
  const origins = (list: string[]) =>
    vi.spyOn(keys, 'resolveKey').mockResolvedValue({ origins: list, enabled: true })

  it("answers frame-ancestors 'none' for an origin with a space and a second directive", async () => {
    origins([A, 'https://b.example.test; script-src *'])

    expect(ancestors(await frameDocument())).toBe("'none'")
  })

  it("answers frame-ancestors 'none' for a wildcard, a path or an upper-case origin", async () => {
    for (const bad of ['*', 'https://a.example.test/path', 'https://A.example.test']) {
      origins([bad])

      expect(ancestors(await frameDocument()), bad).toBe("'none'")
    }
  })

  it('still lists the origins of a well-formed record', async () => {
    origins([A, B])

    expect(ancestors(await frameDocument())).toBe(`${A} ${B}`)
  })
})

describe('a key that is switched off', () => {
  it('answers 200 { enabled: false } on /config, with the origin check still applied', async () => {
    disabled()

    const res = await served(CONFIG, { headers: keyed, bindings: sdkBindings() })
    const other = await served(CONFIG, {
      headers: { Origin: 'https://other.example.test', 'X-Sdk-Key': KEY_A },
      bindings: sdkBindings(),
    })

    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ enabled: false })
    expect(res.headers.get('access-control-allow-origin')).toBe(A)
    expect(other.status).toBe(403)
  })

  it('answers 403 on every other namespace path', async () => {
    disabled()

    const telemetry = await served(TELEMETRY, {
      method: 'POST',
      body: { events: [{ name: 'fixture' }] },
      headers: { 'Sec-Fetch-Site': 'same-origin', 'X-Sdk-Key': KEY_A },
      bindings: sdkBindings(),
    })
    const unknown = await served('/api/sdk/v1/nothing-here', {
      headers: keyed,
      bindings: sdkBindings(),
    })

    for (const res of [telemetry, unknown]) {
      expect(res.status).toBe(403)
      expect((await json<{ error: { code: string } }>(res)).error.code).toBe('forbidden')
      expect(res.headers.get('access-control-allow-origin')).toBeNull()
    }
  })

  it('answers 403 and no allow-origin header to anything but GET or HEAD on the exact path', async () => {
    disabled()
    const send = (method: string, path: string) =>
      served(path, { method, headers: keyed, bindings: sdkBindings() })

    const head = await send('HEAD', CONFIG)
    const refused = await Promise.all([
      send('POST', CONFIG),
      send('PUT', CONFIG),
      send('GET', `${CONFIG}/`),
      send('GET', '/api/sdk/v1/Config'),
    ])
    // Another case of the namespace is not the namespace: the router never reaches the gate.
    const elsewhere = await Promise.all([send('GET', '/api/sdk/V1/config')])

    expect(head.status).toBe(200)
    for (const res of [...refused, ...elsewhere]) {
      expect(res.headers.get('access-control-allow-origin')).toBeNull()
    }
    expect(refused.map((res) => res.status)).toEqual([403, 403, 403, 403])
    expect(elsewhere.map((res) => res.status)).toEqual([404])
  })

  it("answers the frame document with frame-ancestors 'none'", async () => {
    disabled()

    expect(ancestors(await frameDocument())).toBe("'none'")
  })
})

describe('the kill switch beside the key', () => {
  it('answers false when SDK_ENABLED is false and the key is enabled', async () => {
    record(true)

    const res = await served(CONFIG, {
      headers: keyed,
      bindings: sdkBindings({ SDK_ENABLED: 'false' }),
    })

    expect(await json(res)).toEqual({ enabled: false })
  })

  it('answers true when both are on', async () => {
    record(true)

    const res = await served(CONFIG, { headers: keyed, bindings: sdkBindings() })

    expect(await json(res)).toEqual({ enabled: true })
  })
})

describe('a preflight', () => {
  const preflight = (address: string) =>
    served(CONFIG, {
      method: 'OPTIONS',
      headers: { Origin: A, 'Access-Control-Request-Method': 'GET', 'CF-Connecting-IP': address },
      bindings: sdkBindings(),
    })

  it('is counted on the address limit before any lookup, and its 429 has no allow header', async () => {
    const lookup = vi.spyOn(keys, 'isListedOrigin')
    const limit = RATE_LIMITS.sdkPerIp.limit

    for (let i = 0; i < limit; i++) expect((await preflight('203.0.113.50')).status).toBe(204)
    const refused = await preflight('203.0.113.50')
    const again = await preflight('203.0.113.50')

    expect(refused.status).toBe(429)
    expect(again.status).toBe(429)
    for (const res of [refused, again]) {
      for (const name of ['origin', 'methods', 'headers', 'max-age']) {
        expect(res.headers.get(`access-control-allow-${name}`)).toBeNull()
      }
    }
    expect(lookup).toHaveBeenCalledTimes(limit)
  })
})
