// sdk-gate.ts belongs: the one gate of /api/sdk/v1, in order: CORS for this namespace alone, the
// publishable key, then the rate limit by address and by key. api/sdk/routes.ts mounts it first
// with `namespaceGuard(sdkHeaders, ...sdkGate)`: the gates answer or refuse, and `sdkHeaders` puts
// `Vary` and the allowed origin on whatever answer follows, so a 403 and a 429 carry them too.
// `frameOnly` narrows a route to the frame. The Worker has no global CORS layer: nothing else adds
// a cross-origin header to these paths.
// It does not belong: the key lookup (services/security/sdk-keys.ts) or the limits' values
// (config/constants.ts). No cookie is read here, and no response sends Allow-Credentials.
import { RATE_LIMITS } from '../config/constants'
import { isListedOrigin, originsForKey } from '../services/security/sdk-keys'
import { AppError } from '../services/utils/error'
import { guard, type Context, type Gate } from './handler'
import { byIp, rateLimit } from './rate-limit'

const KEY_HEADER = 'x-sdk-key'

const ALLOWED_METHODS = 'GET, POST'
const ALLOWED_HEADERS = `${KEY_HEADER}, content-type`
// One preflight answers repeated calls for ten minutes.
const PREFLIGHT_MAX_AGE = '600'

const keyOf = (ctx: Context): string | undefined => ctx.request.headers.get(KEY_HEADER) ?? undefined

// What a same-origin test protects: the frame calls the API from its own origin, and a page of
// another site must not pass for it. A browser that sends `Sec-Fetch-Site` decides alone (only
// `same-origin` counts, whatever the `Origin` says); without it, no `Origin` or one whose host and
// port equal the request URL's host (a proxy may end TLS, so the scheme is not compared; a Worker
// has no raw `Host` header and a forwarded one plays no part). The limit: a host that proxies the
// API through its own origin, or any client that is not a browser, can make a request look
// same-origin, so only the product's server checks (ADR 0020 N6) see that.
export function isSameOrigin(ctx: Context): boolean {
  const site = ctx.request.headers.get('sec-fetch-site')
  if (site !== null) return site === 'same-origin'
  const origin = ctx.request.headers.get('origin')
  if (origin === null) return true
  try {
    return new URL(origin).host === ctx.url.host
  } catch {
    return false
  }
}

const isPreflight = (ctx: Context) =>
  ctx.request.method === 'OPTIONS' &&
  ctx.request.headers.has('origin') &&
  ctx.request.headers.has('access-control-request-method')

// A route behind `frameOnly` (below) is matched by the router, so the gate can tell before it runs.
const isFrameOnly = (ctx: Context) => ctx.handlers.includes(frameOnly)

// The headers every namespace answer carries. The origin is echoed once the key lists it, so a
// refusal for the origin carries no allow header while a 429 after it does, and the page can read
// it; a frame-only route echoes nothing. `Vary` names the key too: the answer depends on it. A
// preflight sets its own in `cors`.
export function sdkHeaders(ctx: Context): Record<string, string> {
  const origin = ctx.request.headers.get('origin')
  const headers: Record<string, string> = { Vary: 'Origin, X-Sdk-Key' }
  if (
    origin !== null &&
    !isPreflight(ctx) &&
    !isFrameOnly(ctx) &&
    !isSameOrigin(ctx) &&
    originsForKey(ctx.env, keyOf(ctx))?.includes(origin) === true
  ) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

// The address first: a request it refuses never reaches the key's counter, and a preflight is
// counted here before it is answered.
const limitByIp = rateLimit({ name: 'sdkPerIp', ...RATE_LIMITS.sdkPerIp, key: byIp })
const limitByKey = rateLimit({ name: 'sdkPerKey', ...RATE_LIMITS.sdkPerKey, key: keyOf })

// A preflight carries no key (a browser sends none), so it is answered for an origin any key lists
// and the key step sees only the real request. A frame-only route answers it with no allow header.
const cors: Gate = async (ctx) => {
  if (!isPreflight(ctx)) return
  await limitByIp(ctx)
  const origin = ctx.request.headers.get('origin') ?? ''
  const headers: Record<string, string> = {}
  if (!isFrameOnly(ctx) && isListedOrigin(ctx.env, origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Methods'] = ALLOWED_METHODS
    headers['Access-Control-Allow-Headers'] = ALLOWED_HEADERS
    headers['Access-Control-Max-Age'] = PREFLIGHT_MAX_AGE
  }
  return new Response(null, { status: 204, headers })
}

// 403 for no key, an unknown key and an origin the key does not list: the three look the same.
const requireKey: Gate = (ctx) => {
  const origins = originsForKey(ctx.env, keyOf(ctx))
  const origin = ctx.request.headers.get('origin')
  if (origins === undefined || (!isSameOrigin(ctx) && !origins.includes(origin ?? ''))) {
    throw new AppError('forbidden', 'a valid SDK key for this origin is required')
  }
}

export const sdkGate: Gate[] = [cors, requireKey, limitByIp, limitByKey]

// For an entity only the frame calls: `routes.use('/<name>/*', frameOnly)` before its routes, in
// api/sdk/routes.ts. The `/*` matters: without it Hono guards the exact path alone and every
// path under it stays readable by the host page. It runs after the gate, so the key and the
// limits still apply, and refuses whatever is not same-origin with the 403 envelope.
export const frameOnly = guard((ctx) => {
  if (!isSameOrigin(ctx)) {
    throw new AppError('forbidden', 'this endpoint is for the SDK frame only')
  }
})
