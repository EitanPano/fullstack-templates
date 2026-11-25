// GET /api/sdk/frame/v<major>?k=<key>: the frame document, framed only by the origins its key
// lists. A fake ASSETS stands for the platform's assets, and may answer with the headers a
// `_headers` rule would add: none of them may reach the response.
import { describe, expect, it } from 'vitest'

import { json, served } from './helpers'
import { A, B, KEY_A, KEY_B, LOCAL, paths, sdkAssets, sdkBindings } from './sdk-assets'

const DOCUMENT =
  '<!doctype html><title>frame</title><script src="/api/sdk/dist/v1/frame.js"></script>'
const POLICY = (ancestors: string, images: string[] = []) =>
  `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'${images.map((origin) => ` ${origin}`).join('')}; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors ${ancestors}`

type Envelope = { error: { code: string }; requestId: string }

const KEYS = `${KEY_A}=${A},${B};${KEY_B}=${LOCAL}`
// The platform's headers for every file: a rule of `_headers` and the fixed policy of `assemble`.
const RULES = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "base-uri 'self'; frame-ancestors 'none'",
  'Cache-Control': 'public, max-age=3600',
  'Content-Type': 'text/plain',
  'Set-Cookie': 'session=abc',
}

const frame = (
  path: string,
  options: {
    method?: string
    keys?: string | null
    images?: string
    files?: Record<string, string>
    rules?: Record<string, string>
  } = {},
) => {
  const assets = sdkAssets(
    options.files ?? { '/api/sdk/frame/v1': DOCUMENT },
    options.rules ?? RULES,
  )
  const keys = options.keys === undefined ? KEYS : options.keys
  const res = served(path, {
    method: options.method,
    bindings: sdkBindings({ ASSETS: assets.fetcher, SDK_IMG_ORIGINS: options.images }, keys),
  })
  return { assets, res }
}

async function isEnvelope404(res: Response): Promise<boolean> {
  const body = await json<Envelope>(res.clone())
  return (
    res.status === 404 &&
    body.error.code === 'not_found' &&
    body.requestId === res.headers.get('x-request-id')
  )
}

describe('GET /api/sdk/frame/v<major>?k=<key>', () => {
  it('answers the document with the one policy naming the key origins', async () => {
    const { assets, res: pending } = frame(`/api/sdk/frame/v1?k=${KEY_A}`)
    const res = await pending

    expect(res.status).toBe(200)
    expect(await res.text()).toBe(DOCUMENT)
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(res.headers.get('content-security-policy')).toBe(POLICY(`${A} ${B}`))
    expect(paths(assets.seen)).toEqual(['/api/sdk/frame/v1'])
  })

  it('names the SDK_IMG_ORIGINS in img-src, in order, and nowhere else', async () => {
    const images = 'https://img.example.test, https://cdn.example.test:8443'
    const res = await frame(`/api/sdk/frame/v1?k=${KEY_A}`, { images }).res

    expect(res.headers.get('content-security-policy')).toBe(
      POLICY(`${A} ${B}`, ['https://img.example.test', 'https://cdn.example.test:8443']),
    )
  })

  it('keeps img-src to the frame itself while SDK_IMG_ORIGINS is blank', async () => {
    const res = await frame(`/api/sdk/frame/v1?k=${KEY_A}`, { images: '' }).res

    expect(res.headers.get('content-security-policy')).toContain("img-src 'self'; connect-src")
  })

  it('sends no referrer', async () => {
    const res = await frame(`/api/sdk/frame/v1?k=${KEY_A}`).res

    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
  })

  it('sends no X-Frame-Options and none of what a `_headers` rule adds', async () => {
    const res = await frame(`/api/sdk/frame/v1?k=${KEY_A}`).res

    expect(res.headers.get('x-frame-options')).toBeNull()
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(res.headers.get('content-security-policy')).not.toContain("base-uri 'self'")
    expect(res.headers.get('content-security-policy')).not.toContain('upgrade-insecure-requests')
    expect(res.headers.get('content-security-policy')).not.toContain("'unsafe-inline'")
  })

  it('is never cached, since the header depends on the key', async () => {
    const res = await frame(`/api/sdk/frame/v1?k=${KEY_A}`).res

    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-request-id')).toBeTruthy()
  })

  // Without it Chromium on Windows delivers no click to a frame on another site (found by the SDK's
  // e2e beside this template); the other two API templates send it with their other isolation headers.
  it('asks for its own agent cluster, as the other API templates do', async () => {
    const res = await frame(`/api/sdk/frame/v1?k=${KEY_A}`).res

    expect(res.headers.get('origin-agent-cluster')).toBe('?1')
  })

  it('names one origin for a key with one', async () => {
    const res = await frame(`/api/sdk/frame/v1?k=${KEY_B}`).res

    expect(res.headers.get('content-security-policy')).toBe(POLICY(LOCAL))
  })

  it("answers the document with frame-ancestors 'none' for an unknown key", async () => {
    const res = await frame('/api/sdk/frame/v1?k=pk_unknown').res

    expect(res.status).toBe(200)
    expect(await res.text()).toBe(DOCUMENT)
    expect(res.headers.get('content-security-policy')).toBe(POLICY("'none'"))
  })

  it("answers frame-ancestors 'none' for no key, an empty key and a repeated parameter", async () => {
    const queries = ['', '?k=', '?x=pk_test_a', '?k=pk_test_a&k=pk_test_b', '?k[]=pk_test_a']
    for (const query of queries) {
      const res = await frame(`/api/sdk/frame/v1${query}`).res

      expect(res.status, query).toBe(200)
      expect(res.headers.get('content-security-policy'), query).toBe(POLICY("'none'"))
    }
  })

  it("answers frame-ancestors 'none' while SDK_KEYS is unset", async () => {
    const res = await frame(`/api/sdk/frame/v1?k=${KEY_A}`, { keys: null }).res

    expect(res.headers.get('content-security-policy')).toBe(POLICY("'none'"))
  })

  it('does not let the key reach the header: only configured origins are written', async () => {
    const res = await frame('/api/sdk/frame/v1?k=pk_test_a%3B%20script-src%20*').res

    expect(res.headers.get('content-security-policy')).toBe(POLICY("'none'"))
  })

  it('answers HEAD with the headers and no body', async () => {
    const { assets, res: pending } = frame(`/api/sdk/frame/v1?k=${KEY_A}`, { method: 'HEAD' })
    const res = await pending

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('')
    expect(res.headers.get('content-security-policy')).toBe(POLICY(`${A} ${B}`))
    expect(assets.seen.map((request) => request.method)).toEqual(['HEAD'])
  })

  it('answers the 404 envelope for a major with no build and for a name that is no major', async () => {
    const attempts = [
      '/api/sdk/frame/v2?k=pk_test_a',
      '/api/sdk/frame/v1x?k=pk_test_a',
      '/api/sdk/frame/1?k=pk_test_a',
      '/api/sdk/frame/..%2fv1?k=pk_test_a',
      '/api/sdk/frame/v1/extra?k=pk_test_a',
      '/api/sdk/frame/v1/?k=pk_test_a',
      '/api/sdk/frame/v1.html?k=pk_test_a',
      '/api/sdk/frame/?k=pk_test_a',
    ]
    for (const path of attempts) {
      expect(await isEnvelope404(await frame(path).res), path).toBe(true)
    }
  })

  it('never asks the assets for another path than the frame of a major', async () => {
    const attempts = [
      '/api/sdk/frame/v1x',
      '/api/sdk/frame/..%2fv1',
      '/api/sdk/frame/v1/extra',
      '/api/sdk/frame/v1.html',
    ]
    for (const path of attempts) {
      const { assets, res } = frame(path)
      await res

      expect(assets.seen, path).toEqual([])
    }
  })

  it('answers the 404 envelope when the build is missing, with the API’s own headers', async () => {
    const res = await frame(`/api/sdk/frame/v1?k=${KEY_A}`, { files: {} }).res

    expect(await isEnvelope404(res)).toBe(true)
    expect(res.headers.get('content-security-policy')).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    )
    expect(await res.clone().text()).not.toContain('404 page')
  })

  it('answers the 404 envelope to a method other than GET and HEAD', async () => {
    const { assets, res } = frame(`/api/sdk/frame/v1?k=${KEY_A}`, { method: 'POST' })

    expect(await isEnvelope404(await res)).toBe(true)
    expect(assets.seen).toEqual([])
  })
})
