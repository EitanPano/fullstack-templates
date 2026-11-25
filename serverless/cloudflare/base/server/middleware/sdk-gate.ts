// sdk-gate.ts belongs: the one gate of /api/sdk/v1, in order: CORS for this namespace alone, the
// publishable key, then the rate limit by key and by address. api/sdk/routes.ts mounts it first
// with `namespaceGuard(sdkHeaders, ...sdkGate)`: the gates answer or refuse, and `sdkHeaders` puts
// `Vary` and the allowed origin on whatever answer follows, so a 403 and a 429 carry them too.
// It does not belong: the key lookup (services/security/sdk-keys.ts) or the limits' values
// (config/constants.ts). No cookie is read here, and no response sends Allow-Credentials.
import { RATE_LIMITS } from '../config/constants'
import { isListedOrigin, originsForKey } from '../services/security/sdk-keys'
import { AppError } from '../services/utils/error'
import type { Context, Gate } from './handler'
import { byIp, rateLimit } from './rate-limit'

const KEY_HEADER = 'x-sdk-key'

const ALLOWED_METHODS = 'GET, POST'
const ALLOWED_HEADERS = `${KEY_HEADER}, content-type`
// One preflight answers repeated calls for ten minutes.
const PREFLIGHT_MAX_AGE = '600'

const keyOf = (ctx: Context): string | undefined => ctx.request.headers.get(KEY_HEADER) ?? undefined

// A same-origin request (the frame on our own origin) lists no key origin and needs a valid key
// only; a browser still sends Origin on a same-origin POST. The request's own URL host is compared
// with the Origin's, host and port only: a Worker has no raw Host header, and a forwarded one
// plays no part.
export function isSameOrigin(ctx: Context): boolean {
  const origin = ctx.request.headers.get('origin')
  if (origin === null || ctx.request.headers.get('sec-fetch-site') === 'same-origin') return true
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

// The headers every namespace answer carries. The origin is echoed once the key lists it, so a
// refusal for the origin carries no allow header while a 429 after it does, and the page can read
// it. A preflight sets its own in `cors`.
export function sdkHeaders(ctx: Context): Record<string, string> {
  const origin = ctx.request.headers.get('origin')
  const headers: Record<string, string> = { Vary: 'Origin' }
  if (
    origin !== null &&
    !isPreflight(ctx) &&
    !isSameOrigin(ctx) &&
    originsForKey(ctx.env, keyOf(ctx))?.includes(origin) === true
  ) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

// A preflight carries no key (a browser sends none), so it is answered for an origin any key lists
// and the key step sees only the real request.
const cors: Gate = (ctx) => {
  if (!isPreflight(ctx)) return
  const origin = ctx.request.headers.get('origin') ?? ''
  const headers: Record<string, string> = {}
  if (isListedOrigin(ctx.env, origin)) {
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

const limitByKey = rateLimit({ name: 'sdkPerKey', ...RATE_LIMITS.sdkPerKey, key: keyOf })
const limitByIp = rateLimit({ name: 'sdkPerIp', ...RATE_LIMITS.sdkPerIp, key: byIp })

export const sdkGate: Gate[] = [cors, requireKey, limitByKey, limitByIp]
