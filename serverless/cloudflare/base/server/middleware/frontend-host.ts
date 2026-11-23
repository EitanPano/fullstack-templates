// @nofrontends-start
// frontend-host.ts belongs: what the Worker does for a path outside /api: `frontendPages`, the
// handler server.ts mounts last, hands the request to the platform's assets.
// @nofrontends-end
// @frontends-start
// frontend-host.ts belongs: what the Worker does with several frontends. `frontendPages` is the
// handler server.ts mounts for every path outside /api: it maps the request's host to a frontend
// (FRONTEND_HOSTS), fetches the page from that frontend's folder under dist/ through `env.ASSETS`
// and removes the folder from a redirect's Location. A host the map does not name gets a 404.
// For a single-page frontend (a `fallback` in its template) a page path the build has no file for
// is answered with that frontend's shell, so a deep link opens the app.
// `adminHost` is the first step of the admin namespace: with a frontend named `admin`, /api/admin
// answers on that frontend's hosts only. A page never gets the API's headers; a refusal made here
// does.
// @frontends-end
// It does not belong: the admin gate itself (admin-gate.ts) or a page's own rules (the frontend's
// build and its _headers).
// @nofrontends-start
import type { Handler } from './handler'

// With no frontend, or one at the root of dist/: the platform answers a page before the Worker
// runs; this answers only what reaches it, and hands the request over untouched.
export const frontendPages: Handler = (c) => c.env.ASSETS.fetch(c.req.raw)
// @nofrontends-end
// @frontends-start
import { AppError } from '../services/utils/error'
import { errorResponse } from './error-handler'
import { handle, secure, type Context, type Gate } from './handler'

// The path as the folder holds it. `new URL` has already resolved dot segments, so a request for
// /admin/x on the site's host is /site/admin/x: no host reaches another frontend's folder.
function inFolder(url: URL, dir: string): URL {
  const target = new URL(url)
  target.pathname = `/${dir}${url.pathname}`
  return target
}

// A Location the assets wrote, with the folder taken out again (a redirect of `_redirects`, of
// `.html` and of a trailing slash all carry it). A Location on another origin is left alone.
function withoutFolder(location: string, dir: string, base: URL): string | undefined {
  const target = new URL(location, base)
  const folder = `/${dir}`
  if (target.origin !== base.origin) return undefined
  if (target.pathname !== folder && !target.pathname.startsWith(`${folder}/`)) return undefined
  const rest = `${target.pathname.slice(folder.length) || '/'}${target.search}${target.hash}`
  return location.startsWith('/') && !location.startsWith('//') ? rest : new URL(rest, base).href
}

// A page path never needs an encoded slash, backslash or dot. `new URL` leaves them encoded, the
// assets would decode them, and the decoded path could then name another frontend's folder: such
// a request is refused here, before the assets are asked.
const ENCODED_SEPARATOR = /%2f|%5c|%2e/i

// The single-page frontends of this project and the shell each answers with (the `fallback` of its
// template), fixed when the package was generated. A frontend without one is not in the map.
const FALLBACKS = new Map<string, string>(
  (JSON.parse('__FRONTENDS__') as { dir: string; fallback?: string }[]).flatMap((frontend) =>
    frontend.fallback === undefined ? [] : [[frontend.dir, frontend.fallback] as [string, string]],
  ),
)

// A path names a page, not a file, when its last segment has no dot: /a/b and /a/b/ do, /a/x.js
// does not. A missing file must stay a 404 so a broken script is never answered with HTML.
const isPagePath = (pathname: string) => !(pathname.split('/').pop() ?? '').includes('.')

// The frontend's shell, answered as 200 for a page path. The assets may redirect the file's own
// path to its directory (`/admin/index.html` to `/admin/`), so one same-folder redirect is
// followed here; the redirect's Location never reaches the client.
async function shellOf(ctx: Context, dir: string, fallback: string): Promise<Response | undefined> {
  const folder = `/${dir}/`
  let target = inFolder(ctx.url, dir)
  target.pathname = `${folder}${fallback}`
  target.search = ''
  let answer = await ctx.bindings.ASSETS.fetch(new Request(target, ctx.request))
  const location = answer.headers.get('location')
  if (answer.status >= 300 && answer.status < 400 && location !== null) {
    target = new URL(location, target)
    if (target.origin !== ctx.url.origin || !target.pathname.startsWith(folder)) return undefined
    answer = await ctx.bindings.ASSETS.fetch(new Request(target, ctx.request))
  }
  if (answer.status !== 200 && answer.status !== 304) return undefined
  const headers = new Headers(answer.headers)
  headers.set('cache-control', 'no-cache')
  return new Response(answer.body, { status: answer.status, headers })
}

export const frontendPages = handle(async (ctx) => {
  const dir = ctx.env.FRONTEND_HOSTS.get(ctx.url.hostname)
  if (dir === undefined || ENCODED_SEPARATOR.test(ctx.url.pathname)) {
    const refusal = errorResponse(new AppError('not_found', 'not found'), ctx.requestId, ctx.log)
    secure(refusal.headers, ctx.requestId)
    return refusal
  }
  const answer = await ctx.bindings.ASSETS.fetch(new Request(inFolder(ctx.url, dir), ctx.request))
  const fallback = FALLBACKS.get(dir)
  if (
    answer.status === 404 &&
    fallback !== undefined &&
    (ctx.request.method === 'GET' || ctx.request.method === 'HEAD') &&
    isPagePath(ctx.url.pathname)
  ) {
    const shell = await shellOf(ctx, dir, fallback)
    if (shell !== undefined) return shell
  }
  const location = answer.headers.get('location')
  const stripped = location === null ? undefined : withoutFolder(location, dir, ctx.url)
  if (stripped === undefined) return answer
  const headers = new Headers(answer.headers)
  headers.set('location', stripped)
  return new Response(answer.body, { status: answer.status, statusText: answer.statusText, headers })
})

// With a frontend named `admin`, the namespace belongs to its hosts: on any other host the answer
// is the `not_found` envelope, decided before the gate so nothing about the gate is revealed.
export const adminHost: Gate = (ctx) => {
  const hosts = ctx.env.FRONTEND_HOSTS
  if (![...hosts.values()].includes('admin')) return
  if (hosts.get(ctx.url.hostname) !== 'admin') throw new AppError('not_found', 'route not found')
}
// @frontends-end
