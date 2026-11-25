// sdk-files.ts belongs: the two routes outside the key gate that serve the SDK build: the files at
// /api/sdk/dist/v<major>/ and the frame document at /api/sdk/frame/v<major>. `assemble` put them in
// the assets at the same paths; each response is built from the assets' status, body and a
// well-formed ETag alone, so a `_headers` rule changes nothing.
import { isOrigin } from '../config/env'
import { resolveKey } from '../services/security/sdk-keys'
import { AppError } from '../services/utils/error'
import { handle, type Context } from './handler'

// What /api/sdk/dist serves: a major's folder and a script or stylesheet in it, nothing else. The
// path is matched as the URL holds it, so an encoded slash or dot never reaches the assets, and
// frame.html and a source map are not served.
const DIST_FILE = /^\/api\/sdk\/dist\/v[0-9]+\/[A-Za-z0-9._-]+\.(js|css)$/
const FRAME_PATH = /^\/api\/sdk\/frame\/v[0-9]+$/

// A script tag sends no header, so the file is readable from any origin; the cache is short
// because one address moves with every release.
const DIST_HEADERS = {
  'Cache-Control': 'public, max-age=300',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Access-Control-Allow-Origin': '*',
}
const CONTENT_TYPES = { js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8' }

// The frame may load its own script and style, images from the origins `SDK_IMG_ORIGINS` names,
// and call its own origin, nothing more.
const framePolicy = (images: readonly string[], ancestors: string) =>
  `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'${images.map((origin) => ` ${origin}`).join('')}; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors ${ancestors}`

const notFound = () => new AppError('not_found', 'route not found')

// The assets' answer for the file at `pathname`, as a status 200 only: a redirect, a 404 page or an
// error is no file. The request carries the method and nothing of the caller's.
async function fetchFile(ctx: Context, pathname: string): Promise<Response> {
  const target = new URL(pathname, ctx.url)
  const answer = await ctx.bindings.ASSETS.fetch(
    new Request(target, { method: ctx.request.method }),
  )
  if (answer.status !== 200) {
    await answer.body?.cancel()
    throw notFound()
  }
  return answer
}

// An entity tag as RFC 9110 8.8.3 writes it; anything else the assets name is not passed on.
const ETAG = /^(?:W\/)?"[!#-~]*"$/
const opaque = (tag: string) => tag.trim().replace(/^W\//, '')

// Whether `If-None-Match` names the file's validator (the comparison is weak, RFC 9110 13.1.2).
function holds(header: string | null, etag: string): boolean {
  if (header === null) return false
  return header.split(',').some((tag) => tag.trim() === '*' || opaque(tag) === opaque(etag))
}

export const sdkDist = handle(async (ctx) => {
  if (!DIST_FILE.test(ctx.url.pathname)) throw notFound()
  const file = await fetchFile(ctx, ctx.url.pathname)
  const type = ctx.url.pathname.endsWith('.css') ? CONTENT_TYPES.css : CONTENT_TYPES.js
  const base = { ...DIST_HEADERS, 'Content-Type': type }
  const etag = file.headers.get('etag')
  if (etag === null || !ETAG.test(etag)) {
    return new Response(file.body, { status: 200, headers: base })
  }
  const headers = { ...base, ETag: etag }
  // A request that holds the validator gets 304 and no body.
  if (holds(ctx.request.headers.get('if-none-match'), etag)) {
    await file.body?.cancel()
    return new Response(null, { status: 304, headers })
  }
  return new Response(file.body, { status: 200, headers })
})

// The origins that may frame the document: the key's, or none for an unknown, missing, repeated or
// switched-off key, a record with an origin outside the closed form (a lookup may return what a
// store holds, and this text reaches a header) and a lookup that throws (logged by class alone).
async function frameAncestors(ctx: Context): Promise<string> {
  const keys = ctx.url.searchParams.getAll('k')
  try {
    const key = await resolveKey(ctx.env, keys.length === 1 ? keys[0] : undefined)
    if (key?.enabled === true && key.origins.every(isOrigin)) return key.origins.join(' ')
  } catch (error) {
    ctx.log.warn('the SDK key lookup failed', {
      error: error instanceof Error ? error.name : 'unknown',
    })
  }
  return "'none'"
}

// The one HTML page of the API: it may be framed by the origins the key lists and by nothing else,
// so the API's own policy gives way to this one (`secure` keeps a policy already set). An unknown
// or missing key still gets the page, with no ancestor.
export const sdkFrame = handle(async (ctx) => {
  if (!FRAME_PATH.test(ctx.url.pathname)) throw notFound()
  const file = await fetchFile(ctx, ctx.url.pathname)
  const ancestors = await frameAncestors(ctx)
  return new Response(file.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': framePolicy(ctx.env.SDK_IMG_ORIGINS, ancestors),
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
      // The framed unit gets its own agent cluster; without it Chromium on Windows delivers no
      // click to a frame on another site. The other API templates send it with their isolation
      // headers.
      'Origin-Agent-Cluster': '?1',
    },
  })
})
