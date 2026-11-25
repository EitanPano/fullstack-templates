// sdk-files.ts belongs: the two routes that serve the SDK's built files, both outside the key
// gate of /api/sdk/v1: the loader and frame script under /api/sdk/dist/v<major>/ and the frame
// document at /api/sdk/frame/v<major>. server.ts mounts them. `bun run assemble` put the files in
// the assets at the same paths, under /api/, which the Worker answers before the platform does
// (`run_worker_first`), so no file is ever served raw; a response is built here from the status and
// the body of the assets' answer and none of its headers, so a `_headers` rule changes nothing.
// It does not belong: the namespace's JSON endpoints (api/sdk/) or the SDK's own build. Both answer
// the 404 envelope, never a page, and neither is in the OpenAPI document.
import { originsForKey } from '../services/security/sdk-keys'
import { AppError } from '../services/utils/error'
import { handle, type Context } from './handler'

// What /api/sdk/dist serves: a major's folder and a script in it, nothing else. The path is
// matched as the URL holds it, so an encoded slash or dot never reaches the assets, and
// frame.html is not a script.
const DIST_FILE = /^\/api\/sdk\/dist\/v[0-9]+\/[A-Za-z0-9._-]+\.js$/
const FRAME_PATH = /^\/api\/sdk\/frame\/v[0-9]+$/

// A script tag sends no header, so the file is readable from any origin; the cache is short
// because one address moves with every release.
const DIST_HEADERS = {
  'Cache-Control': 'public, max-age=300',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'text/javascript; charset=utf-8',
}

// The frame may load its own script and call its own origin, nothing more.
const FRAME_POLICY =
  "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors"

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

export const sdkDist = handle(async (ctx) => {
  if (!DIST_FILE.test(ctx.url.pathname)) throw notFound()
  const file = await fetchFile(ctx, ctx.url.pathname)
  return new Response(file.body, { status: 200, headers: DIST_HEADERS })
})

// The one HTML page of the API: it may be framed by the origins the key lists and by nothing else,
// so the API's own policy gives way to this one (`secure` keeps a policy already set). An unknown
// or missing key still gets the page, with no ancestor.
export const sdkFrame = handle(async (ctx) => {
  if (!FRAME_PATH.test(ctx.url.pathname)) throw notFound()
  const file = await fetchFile(ctx, ctx.url.pathname)
  const keys = ctx.url.searchParams.getAll('k')
  const ancestors = originsForKey(ctx.env, keys.length === 1 ? keys[0] : undefined)?.join(' ')
  return new Response(file.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': `${FRAME_POLICY} ${ancestors ?? "'none'"}`,
      'Cache-Control': 'no-store',
      // The framed unit gets its own agent cluster; without it Chromium on Windows delivers no click
      // to a frame on another site. The other API templates send it with their isolation headers.
      'Origin-Agent-Cluster': '?1',
    },
  })
})
