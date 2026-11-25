// sdk-gate.ts belongs: the one gate of /api/sdk/v1, in order: CORS for this namespace alone, the
// publishable key, the rate limit by address, then by key. api/sdk/routes.ts mounts it first.
// The project's own CORS_ORIGINS layer skips /api/sdk/ (server.ts), so nothing here is shared with
// it. It does not belong: the key lookup (services/security/sdk-keys.ts) or the limits' values
// (config/constants.ts). No cookie is read here, and no response sends Allow-Credentials.
import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express'

import { RATE_LIMITS } from '../config/constants'
import { isListedOrigin, originsForKey } from '../services/security/sdk-keys'
import { AppError } from '../services/utils/error'
import { byIp, rateLimit } from './rate-limit'

export const SDK_KEY_HEADER = 'x-sdk-key'

const ALLOWED_METHODS = 'GET, POST'
const ALLOWED_HEADERS = `${SDK_KEY_HEADER}, content-type`
// One preflight answers repeated calls for ten minutes.
const PREFLIGHT_MAX_AGE = '600'
const PREFLIGHT_HEADERS = [
  'Access-Control-Allow-Origin',
  'Access-Control-Allow-Methods',
  'Access-Control-Allow-Headers',
  'Access-Control-Max-Age',
]

function keyOf(req: Request): string | undefined {
  return req.get(SDK_KEY_HEADER)
}

// A same-origin request (the frame on our own origin) lists no key origin and needs a valid key
// only; a browser still sends Origin on a same-origin POST. A request that says Sec-Fetch-Site is
// same-origin only when it says `same-origin`; without it, no Origin or an Origin whose host and
// port equal the raw Host header (never X-Forwarded-Host, never the scheme). A host that proxies
// the API through its own origin, or any non-browser client, can look same-origin: only the
// product's server checks (ADR 0020 N6) see that.
export function isSameOrigin(req: Request): boolean {
  const site = req.get('sec-fetch-site')
  if (site !== undefined) return site === 'same-origin'
  const origin = req.get('origin')
  if (origin === undefined) return true
  try {
    return new URL(origin).host.toLowerCase() === req.get('host')?.toLowerCase()
  } catch {
    return false
  }
}

// Preflights wait here for the end of the gate: a frame-only route (below) must be able to take
// the allow headers off before the 204 goes out.
const preflights = new WeakSet<Response>()

const limitByIp = rateLimit({ name: 'sdkPerIp', ...RATE_LIMITS.sdkPerIp, key: byIp })
const limitByKey = rateLimit({ name: 'sdkPerKey', ...RATE_LIMITS.sdkPerKey, key: keyOf })

// The browser's side of the gate. A preflight carries no key, so it is prepared for an origin any
// key lists, counted on the address limit, and answered by endPreflight; the key step sees only
// the real request. A request with no Origin needs none of this. Every answer of the namespace is
// private to its key and origin, so none is stored.
const cors: RequestHandler = (req, res, next) => {
  const origin = req.get('origin')
  res.removeHeader('Access-Control-Allow-Credentials')
  res.set('Cache-Control', 'no-store')
  res.vary('Origin')
  res.vary('X-Sdk-Key')
  if (origin === undefined) {
    next()
    return
  }
  if (req.method === 'OPTIONS' && req.get('access-control-request-method') !== undefined) {
    if (isListedOrigin(origin)) {
      res.set({
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': ALLOWED_METHODS,
        'Access-Control-Allow-Headers': ALLOWED_HEADERS,
        'Access-Control-Max-Age': PREFLIGHT_MAX_AGE,
      })
    }
    preflights.add(res)
    next()
    return
  }
  // The origin is echoed once the key step has confirmed the key lists it, so that a refusal
  // for the origin carries no allow header; a 429 after it does, and the page can read it.
  if (!isSameOrigin(req) && originsForKey(keyOf(req))?.includes(origin) === true) {
    res.set('Access-Control-Allow-Origin', origin)
  }
  next()
}

// 403 for no key, an unknown key and an origin the key does not list: the three look the same.
const requireKey: RequestHandler = (req, res, next) => {
  if (preflights.has(res)) {
    next()
    return
  }
  const origins = originsForKey(keyOf(req))
  const origin = req.get('origin')
  if (origins === undefined || (!isSameOrigin(req) && !origins.includes(origin ?? ''))) {
    next(new AppError('forbidden', 'a valid SDK key for this origin is required'))
    return
  }
  next()
}

// The address first: a request it refuses never reaches the key's counter, so one address cannot
// use up an integration's limit.
export const sdkGate: RequestHandler[] = [cors, requireKey, limitByIp, limitByKey]

// Answers a preflight the gate prepared. api/sdk/routes.ts mounts it after the frame-only
// entities and before the others.
export const endPreflight: RequestHandler = (_req, res, next) => {
  if (!preflights.has(res)) {
    next()
    return
  }
  res.status(204).end()
}

// Lets only the frame through: a request that is not same-origin gets the 403 envelope and no
// allow header, and a preflight to the route is answered with none. The key and the limits have
// run already. Mount an entity the host page must not read with `frameOnly` (see api/sdk/routes.ts).
const guardFrame: RequestHandler = (req, res, next) => {
  if (preflights.has(res)) {
    for (const header of PREFLIGHT_HEADERS) res.removeHeader(header)
    res.status(204).end()
    return
  }
  if (isSameOrigin(req)) {
    next()
    return
  }
  res.removeHeader('Access-Control-Allow-Origin')
  next(new AppError('forbidden', 'this endpoint is for the SDK frame only'))
}

// A refusal of the gate itself (a 429) never reaches the guard: Express hands it to the error
// handlers of the path, so this one takes the allow header off before the envelope goes out.
const hideFromHost: ErrorRequestHandler = (error, req, res, next) => {
  if (!isSameOrigin(req)) res.removeHeader('Access-Control-Allow-Origin')
  next(error)
}

export const frameOnly: [RequestHandler, ErrorRequestHandler] = [guardFrame, hideFromHost]
