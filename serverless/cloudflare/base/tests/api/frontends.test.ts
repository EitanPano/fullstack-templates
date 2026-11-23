// What the Worker does for a path outside /api and for the admin namespace. A fake `ASSETS` stands
// for the platform's assets, so the test sees exactly which path the Worker asked it for; the real
// assets, headers and redirects are proved by tests/unit/start.test.ts on a running `wrangler dev`.
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import adminRoutes from '../../server/api/admin/routes'
import { handle, json as jsonResponse } from '../../server/middleware/handler'
import { json, served } from './helpers'

type Envelope = { error: { code: string }; requestId: string }

// A fake assets binding: serves the files it is given, answers the redirects it is given, and
// remembers every request it saw.
function assets(files: Record<string, string> = {}, redirects: Record<string, string> = {}) {
  const seen: Request[] = []
  const fetcher = {
    fetch(input: Request) {
      seen.push(input)
      const { pathname } = new URL(input.url)
      const to = redirects[pathname]
      if (to !== undefined) return Promise.resolve(new Response(null, { status: 301, headers: { location: to } }))
      const body = files[pathname]
      if (body === undefined) return Promise.resolve(new Response('missing page', { status: 404 }))
      if (input.headers.get('if-none-match') === '"v1"') return Promise.resolve(new Response(null, { status: 304 }))
      return Promise.resolve(new Response(input.method === 'HEAD' ? null : body, { headers: { etag: '"v1"' } }))
    },
  }
  return { seen, bindings: { ...env, ASSETS: fetcher } }
}

// @frontends-start
const paths = (seen: Request[]) => seen.map((request) => new URL(request.url).pathname)
const listed = JSON.parse('__FRONTENDS__') as { dir: string; fallback?: string }[]
const dirs = listed.map((frontend) => frontend.dir)
const [first = '', second = ''] = dirs
const hostOf = (dir: string) => `${dir}.localhost`
const pages = Object.fromEntries(
  dirs.flatMap((dir) => [
    [`/${dir}/`, `page of ${dir}`],
    [`/${dir}/about`, `about of ${dir}`],
  ]),
)

describe('pages, one host per frontend', () => {
  it('shows each frontend on its own host, from that frontend’s folder', async () => {
    const a = assets(pages)

    for (const dir of dirs) {
      const res = await served('/', { host: hostOf(dir), bindings: a.bindings })
      expect(res.status).toBe(200)
      expect(await res.text()).toBe(`page of ${dir}`)
    }
    const about = await served('/about', { host: hostOf(first), bindings: a.bindings })
    expect(await about.text()).toBe(`about of ${first}`)
    expect(paths(a.seen)).toEqual([...dirs.map((dir) => `/${dir}/`), `/${first}/about`])
  })

  it('compares the host without its port and in any case, and lets a frontend have several hosts', async () => {
    const a = assets(pages)
    const bindings = { ...a.bindings, FRONTEND_HOSTS: `Www.Example.COM=${first},${hostOf(second)}=${second}` }
    const named = await served('/', { host: 'WWW.example.com:8788', bindings })

    expect(await named.text()).toBe(`page of ${first}`)
    expect(await (await served('/', { host: hostOf(second), bindings })).text()).toBe(`page of ${second}`)
  })

  it('answers a host the map does not name with a 404 envelope and never asks the assets', async () => {
    const a = assets(pages)

    for (const host of ['example.com', '127.0.0.1', `x.${hostOf(first)}`, 'localhost']) {
      const res = await served('/', { host, bindings: a.bindings })
      expect(res.status).toBe(404)
      const body = await json<Envelope>(res)
      expect(body.error.code).toBe('not_found')
      expect(body.requestId).toBe(res.headers.get('x-request-id'))
      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
      expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
      expect(res.headers.get('cache-control')).toBe('no-store')
    }
    expect((await served('/about', { host: 'example.com', bindings: a.bindings })).status).toBe(404)
    expect(a.seen).toEqual([])
  })

  it('never lets one host reach another frontend’s folder', async () => {
    const a = assets({ ...pages, [`/${first}/${second}/x`]: 'inside first' })

    const inside = await served(`/${second}/x`, { host: hostOf(first), bindings: a.bindings })
    expect(await inside.text()).toBe('inside first')
    for (const path of [`/../${second}/`, `/%2e%2e/${second}/`, `/..%2f${second}/`, `//${second}/`]) {
      const res = await served(path, { host: hostOf(first), bindings: a.bindings })
      expect(await res.text(), path).not.toContain(`page of ${second}`)
    }
    expect(paths(a.seen).every((path) => path.startsWith(`/${first}/`))).toBe(true)
    expect(paths(a.seen).some((path) => path.startsWith(`/${second}/`))).toBe(false)
  })

  it('refuses a path with an encoded slash, backslash or dot, and never asks the assets', async () => {
    const a = assets(pages)

    for (const path of [
      `/..%2f${second}/`,
      `/..%2F${second}%2Fabout`,
      `/%2e%2e%2f${second}/`,
      `/..%5c${second}%5cabout`,
      `/x/..%2f..%2f${second}/`,
      '/..%2f_headers',
    ]) {
      const res = await served(path, { host: hostOf(first), bindings: a.bindings })
      expect(res.status, path).toBe(404)
      expect((await json<Envelope>(res)).error.code, path).toBe('not_found')
    }
    expect(a.seen).toEqual([])
  })

  it('takes the folder out of a redirect’s Location, whatever form the assets wrote it in', async () => {
    const host = hostOf(first)
    const a = assets(pages, {
      [`/${first}/about.html`]: `/${first}/about`,
      [`/${first}/docs`]: `/${first}/docs/?a=1#top`,
      [`/${first}/home`]: `/${first}`,
      [`/${first}/abs`]: `http://${host}/${first}/about`,
      [`/${first}/away`]: 'https://example.com/elsewhere',
      [`/${first}/near`]: `/${first}x/about`,
      [`/${first}/other`]: `/${second}/about`,
    })
    const location = async (path: string) =>
      (await served(path, { host, bindings: a.bindings })).headers.get('location')

    expect(await location('/about.html')).toBe('/about')
    expect(await location('/docs')).toBe('/docs/?a=1#top')
    expect(await location('/home')).toBe('/')
    expect(await location('/abs')).toBe(`http://${host}/about`)
    // Not this frontend's folder: left as the assets wrote it.
    expect(await location('/away')).toBe('https://example.com/elsewhere')
    expect(await location('/near')).toBe(`/${first}x/about`)
    expect(await location('/other')).toBe(`/${second}/about`)
    const res = await served('/about.html', { host, bindings: a.bindings })
    expect(res.status).toBe(301)
  })

  it('keeps conditional and HEAD requests working', async () => {
    const a = assets(pages)
    const host = hostOf(first)

    const fresh = await served('/about', { host, bindings: a.bindings })
    expect(fresh.headers.get('etag')).toBe('"v1"')
    const cached = await served('/about', {
      host,
      headers: { 'if-none-match': '"v1"' },
      bindings: a.bindings,
    })
    expect(cached.status).toBe(304)
    const head = await served('/about', { host, method: 'HEAD', bindings: a.bindings })
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
    expect(a.seen.map((request) => request.method)).toEqual(['GET', 'GET', 'HEAD'])
  })

  it('passes a page’s own response through, without the API’s headers, and a missing page as the assets say', async () => {
    const a = assets(pages)
    const host = hostOf(first)

    const page = await served('/', { host, bindings: a.bindings })
    expect(page.headers.get('x-request-id')).toBeNull()
    expect(page.headers.get('content-security-policy')).toBeNull()
    const missing = await served('/nope', { host, bindings: a.bindings })
    expect(missing.status).toBe(404)
    expect(await missing.text()).toBe('missing page')
    expect(missing.headers.get('x-request-id')).toBeNull()
  })

  it('refuses every page with a bare 500 and the security headers when the map is invalid', async () => {
    const a = assets(pages)

    const res = await served('/', {
      host: hostOf(first),
      bindings: { ...a.bindings, FRONTEND_HOSTS: '' },
    })
    expect(res.status).toBe(500)
    expect((await json<Envelope>(res)).error.code).toBe('internal')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(a.seen).toEqual([])
  })
})

// A single-page frontend (a `fallback` in its template) answers a deep link with its shell. Only a
// plan that holds one runs these; the other frontend's host must never get the shell.
const spa = listed.find((frontend) => frontend.fallback !== undefined)
const spaDir = spa?.dir ?? ''
const shell = spa?.fallback ?? ''
const otherDir = dirs.find((dir) => dir !== spaDir) ?? ''

describe.runIf(spa !== undefined)('a single-page frontend’s deep links', () => {
  const files = () => ({ ...pages, [`/${spaDir}/${shell}`]: `shell of ${spaDir}`, [`/${spaDir}/app.js`]: 'script' })

  it('answers a page path the build has no file for with the shell, 200 and no-cache', async () => {
    const a = assets(files())

    for (const path of ['/some/route', '/some/route/', '/deep/er/still/1']) {
      const res = await served(path, { host: hostOf(spaDir), bindings: a.bindings })
      expect(res.status, path).toBe(200)
      expect(await res.text(), path).toBe(`shell of ${spaDir}`)
      expect(res.headers.get('cache-control'), path).toBe('no-cache')
    }
    const head = await served('/some/route', { host: hostOf(spaDir), method: 'HEAD', bindings: a.bindings })
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
  })

  it('follows the assets’ redirect of the shell file to its folder and shows no Location', async () => {
    const a = assets(
      { ...pages, [`/${spaDir}/`]: `shell of ${spaDir}` },
      { [`/${spaDir}/${shell}`]: `/${spaDir}/` },
    )
    const res = await served('/some/route', { host: hostOf(spaDir), bindings: a.bindings })

    expect(res.status).toBe(200)
    expect(await res.text()).toBe(`shell of ${spaDir}`)
    expect(res.headers.get('location')).toBeNull()
  })

  it('keeps a real page and a file the build has as they are', async () => {
    const a = assets(files())
    const home = await served('/', { host: hostOf(spaDir), bindings: a.bindings })
    expect(await home.text()).toBe(`page of ${spaDir}`)
    const script = await served('/app.js', { host: hostOf(spaDir), bindings: a.bindings })
    expect(await script.text()).toBe('script')
    expect(script.headers.get('cache-control')).not.toBe('no-cache')
  })

  it('keeps a missing file a 404, never the shell', async () => {
    const a = assets(files())

    for (const path of ['/missing.js', '/assets/x.css', '/some/route.html', '/.well-known/x.json']) {
      const res = await served(path, { host: hostOf(spaDir), bindings: a.bindings })
      expect(res.status, path).toBe(404)
      expect(await res.text(), path).toBe('missing page')
    }
  })

  it('answers a method other than GET and HEAD with what the assets say, not the shell', async () => {
    const a = assets(files())

    for (const method of ['POST', 'PUT', 'DELETE']) {
      const res = await served('/some/route', { host: hostOf(spaDir), method, bindings: a.bindings })
      expect(await res.text(), method).not.toContain('shell of')
      expect(res.status, method).toBe(404)
    }
  })

  it('is a 404 when the build holds no shell', async () => {
    const a = assets(pages)
    const res = await served('/some/route', { host: hostOf(spaDir), bindings: a.bindings })

    expect(res.status).toBe(404)
  })

  it('never gives the shell to another frontend’s host', async () => {
    const a = assets(files())
    if (otherDir === '') return
    const res = await served('/some/route', { host: hostOf(otherDir), bindings: a.bindings })

    expect(res.status).toBe(404)
    expect(await res.text()).toBe('missing page')
    expect(paths(a.seen).every((path) => path.startsWith(`/${otherDir}/`))).toBe(true)
  })

  // A whole `%2e%2e` segment is no case here: `new URL` resolves it as `..` (`/%2e%2e/x` is `/x`).
  it('still refuses an encoded separator before the assets are asked', async () => {
    const a = assets(files())

    for (const path of ['/..%2fx', `/..%2f${otherDir}/`, '/some%2froute', '/a%5cb', '/%2e%2e%2fx']) {
      const res = await served(path, { host: hostOf(spaDir), bindings: a.bindings })
      expect(res.status, path).toBe(404)
      expect((await json<Envelope>(res)).error.code, path).toBe('not_found')
    }
    expect(a.seen).toEqual([])
  })
})

describe('/api outside the admin namespace, on every host', () => {
  it('answers /api/health on a frontend host, on 127.0.0.1 and on a host the map does not name', async () => {
    for (const host of [hostOf(first), hostOf(second), '127.0.0.1:8788', 'example.com']) {
      const res = await served('/api/health', { host })
      expect(res.status).toBe(200)
      expect(await json(res)).toMatchObject({ status: 'ok' })
      expect(res.headers.get('x-request-id')).toBeTruthy()
    }
  })

  it('answers an unknown /api path with the envelope, never the page of the host', async () => {
    const a = assets(pages)
    const res = await served('/api/nothing-here', { host: hostOf(first), bindings: a.bindings })

    expect(res.status).toBe(404)
    expect((await json<Envelope>(res)).error.code).toBe('not_found')
    expect(a.seen).toEqual([])
  })
})

const hasAdmin = dirs.includes('admin')
const adminHosts = dirs.filter((dir) => dir === 'admin').map(hostOf)
const otherHosts = dirs.filter((dir) => dir !== 'admin').map(hostOf)
const unmapped = ['127.0.0.1:8788', 'example.com']

// The namespace belongs to the host of a frontend named admin; a plan without one has no such rule.
if (hasAdmin) {
  describe('/api/admin with a frontend named admin', () => {
    it('is the not_found envelope on any other host, decided before the gate', async () => {
      for (const host of [...otherHosts, ...unmapped]) {
        for (const path of ['/api/admin/probe', '/api/admin', '/api/admin/a/b']) {
          const res = await served(path, { host })
          expect(res.status, `${host}${path}`).toBe(404)
          const body = await json<Envelope>(res)
          expect(body.error.code).toBe('not_found')
          expect(body.requestId).toBe(res.headers.get('x-request-id'))
        }
      }
    })

    it('reaches the gate on the admin frontend’s host, which refuses with 403 until the product writes its own', async () => {
      for (const host of adminHosts) {
        for (const path of ['/api/admin/probe', '/api/admin']) {
          for (const method of ['GET', 'POST']) {
            const res = await served(path, { host, method })
            expect(res.status, `${method} ${path}`).toBe(403)
            expect((await json<Envelope>(res)).error.code).toBe('forbidden')
          }
        }
      }
    })
  })
} else {
  describe('/api/admin with no frontend named admin', () => {
    it('reaches the gate on every host', async () => {
      for (const host of [...otherHosts, ...unmapped]) {
        const res = await served('/api/admin/probe', { host })
        expect(res.status).toBe(403)
        expect((await json<Envelope>(res)).error.code).toBe('forbidden')
      }
    })
  })
}
// @frontends-end
// @nofrontends-start
describe('the Worker with one frontend or none', () => {
  it('hands a path outside /api to the assets untouched, on any host', async () => {
    const a = assets({ '/': 'the home page', '/about': 'about' })

    for (const host of ['example.com', 'site.localhost', '127.0.0.1:8788']) {
      const res = await served('/about?x=1', { host, bindings: a.bindings })
      expect(await res.text()).toBe('about')
    }
    expect(a.seen.map((request) => new URL(request.url).pathname + new URL(request.url).search)).toEqual(
      ['/about?x=1', '/about?x=1', '/about?x=1'],
    )
  })

  it('has no host map: the variable is not in the bindings and /api answers on any host', async () => {
    expect(Object.keys(env)).not.toContain('FRONTEND_HOSTS')
    for (const host of ['example.com', 'anything.localhost']) {
      expect((await served('/api/health', { host })).status).toBe(200)
    }
  })

  it('refuses /api/admin on every host with 403, the gate being the namespace’s only rule', async () => {
    for (const host of ['example.com', 'admin.localhost']) {
      for (const path of ['/api/admin/probe', '/api/admin']) {
        const res = await served(path, { host })
        expect(res.status).toBe(403)
        expect((await json<Envelope>(res)).error.code).toBe('forbidden')
      }
    }
  })
})
// @nofrontends-end

describe('the admin namespace', () => {
  it('answers 403 in the error envelope with a request id and the API headers, for any method', async () => {
    const host = namespaceHost()
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const res = await served('/api/admin/anything', { host, method })
      const body = await json<Envelope>(res)

      expect(res.status).toBe(403)
      expect(body.error.code).toBe('forbidden')
      expect(body.requestId).toBe(res.headers.get('x-request-id'))
      expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
    }
  })

  it('is the same in production: the gate does not depend on the environment', async () => {
    const res = await served('/api/admin/anything', {
      host: namespaceHost(),
      bindings: { ...env, ENVIRONMENT: 'production' },
    })

    expect(res.status).toBe(403)
  })
})

// A handler mounted in the admin sub-app, as a product's first admin entity would be: it runs only
// for a caller the gate (and, beside an admin frontend, the host rule) admits.
let adminHandlerCalls = 0
adminRoutes.get(
  '/leak-probe',
  handle(() => {
    adminHandlerCalls++
    return jsonResponse({ ok: true })
  }),
)

describe('the admin namespace, by spelling', () => {
  // The status each spelling gets today on a host the namespace answers on: Hono matches paths
  // case-sensitively, ignores one trailing slash and decodes an unreserved percent escape.
  it.each([
    ['/api/admin/leak-probe', 403],
    ['/api/admin/leak-probe/', 403],
    ['/api/%61dmin/leak-probe', 403],
    ['/api/ADMIN/leak-probe', 404],
    ['/api/Admin/leak-probe', 404],
    ['/api/adminx/leak-probe', 404],
    ['/api/admin/', 403],
  ])('never reaches an admin handler through %s (status %i)', async (path, status) => {
    adminHandlerCalls = 0
    const res = await served(path, { host: namespaceHost() })

    expect(res.status).toBe(status)
    expect((await json<Envelope>(res)).error.code).toBe(status === 403 ? 'forbidden' : 'not_found')
    expect(adminHandlerCalls).toBe(0)
  })

  // @frontends-start
  it.runIf(hasAdmin)('answers 404 and never calls an admin handler on a host that is not the admin frontend’s', async () => {
    adminHandlerCalls = 0
    for (const host of [...otherHosts, ...unmapped]) {
      for (const path of ['/api/admin/leak-probe', '/api/admin/leak-probe/', '/api/%61dmin/leak-probe']) {
        const res = await served(path, { host })
        expect(res.status, `${host}${path}`).toBe(404)
      }
    }
    expect(adminHandlerCalls).toBe(0)
  })
  // @frontends-end
})

// The host a request to the namespace may use in every variant: the admin frontend's, when the
// plan has one, otherwise any.
function namespaceHost(): string {
  // @frontends-start
  return dirs.includes('admin') ? hostOf('admin') : hostOf(first)
  // @frontends-end
  // @nofrontends-start
  return 'example.com'
  // @nofrontends-end
}
