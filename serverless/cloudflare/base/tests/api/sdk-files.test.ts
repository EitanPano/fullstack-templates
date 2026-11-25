// GET and HEAD /api/sdk/dist/v<major>/<file>.js and .css: the SDK's script and style files, outside
// the key gate. A fake ASSETS stands for the platform's assets, so a test sees which path the
// Worker asked for and can make the assets answer with headers a `_headers` rule would add. The
// real assets, and that the frame document is nowhere else, are proved by
// tests/unit/sdk-start.test.ts.
import { describe, expect, it } from 'vitest'

import { json, served } from './helpers'
import { paths, sdkAssets, sdkBindings } from './sdk-assets'

const LOADER = '(()=>{window.__loader=1})()'
const BASE = '/api/sdk/dist/v1'

// What the assemble step puts in the assets: the allow-listed scripts and the frame document.
const FILES = {
  [`${BASE}/loader.js`]: LOADER,
  [`${BASE}/frame.css`]: 'body{margin:0}',
  [`${BASE}/frame.js`]: 'console.log("frame")',
  '/api/sdk/dist/v2/loader.js': 'two',
  '/api/sdk/frame/v1': '<!doctype html><title>frame</title>',
  '/canary.js': 'CANARY',
}

type Envelope = { error: { code: string }; requestId: string }

const reach = (
  path: string,
  options: {
    method?: string
    headers?: Record<string, string>
    files?: Record<string, string>
    extra?: Record<string, string>
  } = {},
) => {
  const assets = sdkAssets(options.files ?? FILES, options.extra)
  const res = served(path, {
    method: options.method,
    headers: options.headers,
    bindings: sdkBindings({ ASSETS: assets.fetcher }),
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

describe('GET and HEAD /api/sdk/dist/v<major>/<file>', () => {
  it('serves the loader with the cross-origin headers and a short cache', async () => {
    const { assets, res: pending } = reach(`${BASE}/loader.js`)
    const res = await pending

    expect(res.status).toBe(200)
    expect(await res.text()).toBe(LOADER)
    expect(res.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(res.headers.get('cache-control')).toBe('public, max-age=300')
    expect(res.headers.get('cross-origin-resource-policy')).toBe('cross-origin')
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('access-control-allow-credentials')).toBeNull()
    expect(res.headers.get('x-request-id')).toBeTruthy()
    expect(paths(assets.seen)).toEqual([`${BASE}/loader.js`])
  })

  it("passes the file's validator on, and answers 304 with no body to a request that holds it", async () => {
    const extra = { etag: '"abc123"' }
    const first = await reach(`${BASE}/loader.js`, { extra }).res
    const again = await reach(`${BASE}/loader.js`, {
      extra,
      headers: { 'If-None-Match': '"other", W/"abc123"' },
    }).res

    expect(first.status).toBe(200)
    expect(first.headers.get('etag')).toBe('"abc123"')
    expect(again.status).toBe(304)
    expect(await again.text()).toBe('')
    expect(again.headers.get('etag')).toBe('"abc123"')
    expect(again.headers.get('cache-control')).toBe('public, max-age=300')
    expect(again.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('sends the file to a request that holds another validator', async () => {
    const res = await reach(`${BASE}/loader.js`, {
      extra: { etag: '"abc123"' },
      headers: { 'If-None-Match': '"other"' },
    }).res

    expect(res.status).toBe(200)
    expect(await res.text()).toBe(LOADER)
  })

  it('names no validator when the assets name none or a malformed one', async () => {
    const none = await reach(`${BASE}/loader.js`).res
    const malformed = await reach(`${BASE}/loader.js`, {
      extra: { etag: 'not-quoted' },
      headers: { 'If-None-Match': 'not-quoted' },
    }).res

    expect(none.headers.get('etag')).toBeNull()
    expect(malformed.status).toBe(200)
    expect(malformed.headers.get('etag')).toBeNull()
  })

  it('serves a request that carries no key and no Origin, as a script tag does', async () => {
    const { res } = reach(`${BASE}/frame.js`)

    expect((await res).status).toBe(200)
  })

  it('answers HEAD with the same headers and no body', async () => {
    const { assets, res: pending } = reach(`${BASE}/loader.js`, { method: 'HEAD' })
    const res = await pending

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('')
    expect(res.headers.get('cache-control')).toBe('public, max-age=300')
    expect(res.headers.get('cross-origin-resource-policy')).toBe('cross-origin')
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-type')).toMatch(/javascript/)
    expect(assets.seen.map((request) => request.method)).toEqual(['HEAD'])
  })

  it('serves a stylesheet as text/css with the same headers, an ETag and a 304', async () => {
    const extra = { etag: '"css1"' }
    const first = await reach(`${BASE}/frame.css`, { extra }).res
    const again = await reach(`${BASE}/frame.css`, {
      extra,
      headers: { 'If-None-Match': '"css1"' },
    }).res

    expect(first.status).toBe(200)
    expect(await first.text()).toBe('body{margin:0}')
    expect(first.headers.get('content-type')).toBe('text/css; charset=utf-8')
    expect(first.headers.get('cache-control')).toBe('public, max-age=300')
    expect(first.headers.get('cross-origin-resource-policy')).toBe('cross-origin')
    expect(first.headers.get('access-control-allow-origin')).toBe('*')
    expect(first.headers.get('x-content-type-options')).toBe('nosniff')
    expect(first.headers.get('etag')).toBe('"css1"')
    expect(again.status).toBe(304)
    expect(again.headers.get('content-type')).toBe('text/css; charset=utf-8')
  })

  it('answers HEAD for a stylesheet with the headers and no body', async () => {
    const { assets, res: pending } = reach(`${BASE}/frame.css`, { method: 'HEAD' })
    const res = await pending

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('')
    expect(res.headers.get('content-type')).toBe('text/css; charset=utf-8')
    expect(assets.seen.map((request) => request.method)).toEqual(['HEAD'])
  })

  it('serves another major from its own folder', async () => {
    const res = await reach('/api/sdk/dist/v2/loader.js').res

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('two')
  })

  it('answers the 404 envelope for frame.html: the frame document has its own route', async () => {
    const files = { ...FILES, [`${BASE}/frame.html`]: '<!doctype html><title>frame</title>' }
    const { assets, res } = reach(`${BASE}/frame.html`, { files })

    expect(await isEnvelope404(await res)).toBe(true)
    expect(assets.seen).toEqual([])
  })

  it('answers the 404 envelope for a name outside the allow-list, and never asks the assets', async () => {
    const attempts = [
      `${BASE}/notes.txt`,
      `${BASE}/map.js.map`,
      `${BASE}/frame.css.map`,
      `${BASE}/frame.CSS`,
      `${BASE}/loader.JS`,
      `${BASE}/loader.js/`,
      '/api/sdk/dist/loader.js',
      '/api/sdk/dist/v/loader.js',
      '/api/sdk/dist/vx/loader.js',
      '/api/sdk/dist/v1/sub/loader.js',
      '/api/sdk/dist/v1/',
      '/api/sdk/dist/',
      '/api/sdk/dist',
    ]
    for (const path of attempts) {
      const { assets, res } = reach(path)

      expect(await isEnvelope404(await res), path).toBe(true)
      expect(assets.seen, path).toEqual([])
    }
  })

  it('answers the 404 envelope for a missing file, a missing major and a directory', async () => {
    for (const path of [`${BASE}/missing.js`, '/api/sdk/dist/v9/loader.js', `${BASE}/folder.js`]) {
      const { res } = reach(path)

      expect(await isEnvelope404(await res), path).toBe(true)
    }
  })

  it('answers the 404 envelope, not the frontend’s 404 page, and carries none of the file headers', async () => {
    const res = await reach(`${BASE}/missing.js`).res

    expect(await res.text()).not.toContain('404 page')
    expect(res.headers.get('cache-control') ?? '').not.toContain('max-age=300')
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('answers the 404 envelope when the assets answer a redirect or an error, and forwards neither', async () => {
    const redirecting = {
      fetch: () =>
        Promise.resolve(new Response(null, { status: 307, headers: { location: '/elsewhere' } })),
    }
    const failing = { fetch: () => Promise.resolve(new Response('boom', { status: 500 })) }

    for (const ASSETS of [redirecting, failing]) {
      const res = await served(`${BASE}/loader.js`, { bindings: sdkBindings({ ASSETS }) })

      expect(await isEnvelope404(res)).toBe(true)
      expect(res.headers.get('location')).toBeNull()
    }
  })

  it('refuses traversal in every spelling, and never asks the assets for anything else', async () => {
    const attempts = [
      '/api/sdk/dist/v1/../../canary.js',
      '/api/sdk/dist/v1/..%2f..%2fcanary.js',
      '/api/sdk/dist/v1/%2e%2e/%2e%2e/canary.js',
      '/api/sdk/dist/v1/%2E%2E%2Fcanary.js',
      '/api/sdk/dist/..%2fcanary.js',
      '/api/sdk/dist/v1/..\\..\\canary.js',
      '/api/sdk/dist/v1/%5c..%5ccanary.js',
      '/api/sdk/dist/v1%2floader.js',
      '/api/sdk/dist/v1/loader.js%00',
      '/api/sdk/dist/v1/loader%2ejs',
      '/api/sdk/dist/v1/%2e%2e%2f%2e%2e%2fcanary.js',
    ]
    for (const path of attempts) {
      const { assets, res: pending } = reach(path)
      const res = await pending

      expect(await res.text(), path).not.toContain('CANARY')
      expect(res.status, path).toBe(404)
      expect(
        paths(assets.seen).every((seen) =>
          /^\/api\/sdk\/dist\/v[0-9]+\/[A-Za-z0-9._-]+\.(js|css)$/.test(seen),
        ),
        path,
      ).toBe(true)
    }
  })

  it('answers the 404 envelope to a method other than GET and HEAD', async () => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const { assets, res } = reach(`${BASE}/loader.js`, { method })

      expect(await isEnvelope404(await res), method).toBe(true)
      expect(assets.seen, method).toEqual([])
    }
  })

  it('answers the 404 envelope while no build was assembled: the assets hold no file', async () => {
    const { res } = reach(`${BASE}/loader.js`, { files: {} })

    expect(await isEnvelope404(await res)).toBe(true)
  })

  it('keeps the headers of the Worker whatever a `_headers` rule adds to the file', async () => {
    const extra = {
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'",
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Access-Control-Allow-Origin': 'https://evil.example.test',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Set-Cookie': 'session=abc',
      'X-Content-Type-Options': 'sniff',
    }
    const res = await reach(`${BASE}/loader.js`, { extra }).res

    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, max-age=300')
    expect(res.headers.get('cross-origin-resource-policy')).toBe('cross-origin')
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(res.headers.get('x-frame-options')).toBeNull()
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('does not depend on the host: a host the frontend map lacks gets the file too', async () => {
    const assets = sdkAssets(FILES)

    const res = await served(`${BASE}/loader.js`, {
      host: 'unmapped.example.test',
      bindings: sdkBindings({ ASSETS: assets.fetcher }),
    })

    expect(res.status).toBe(200)
  })
})
