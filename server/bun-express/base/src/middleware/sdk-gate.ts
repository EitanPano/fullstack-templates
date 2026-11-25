// sdk-gate.ts belongs: the one gate of /api/sdk/v1, in order: CORS for this namespace alone, the
// publishable key, the rate limit by address, then by key. api/sdk/routes.ts mounts it first.
// The key is resolved once and kept in res.locals.sdk; a lookup that throws is the server's own
// 500, never a valid key. It does not belong: the key lookup (services/security/sdk-keys.ts),
// the limits' values (config/constants.ts) or the project's own CORS layer, which skips this path.
import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express'

import { RATE_LIMITS } from '../config/constants'
import { isListedOrigin, resolveKey } from '../services/security/sdk-keys'
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

// The one request a switched-off key still answers: it tells the loader to draw nothing.
const isConfigRead = (req: Request) =>
  (req.method === 'GET' || req.method === 'HEAD') && req.path === '/config'

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

// The browser's side of the gate. A preflight carries no key: it is marked here and answered by
// endPreflight, and the key step sees only the real request. Every answer of the namespace is
// private to its key and origin, so none is stored.
const cors: RequestHandler = async (req, res, next) => {
  const origin = req.get('origin')
  res.removeHeader('Access-Control-Allow-Credentials')
  res.set('Cache-Control', 'no-store')
  res.vary('Origin')
  res.vary('X-Sdk-Key')
  if (
    origin !== undefined &&
    req.method === 'OPTIONS' &&
    req.get('access-control-request-method') !== undefined
  ) {
    preflights.add(res)
    next()
    return
  }
  try {
    const key = keyOf(req)
    const record = await resolveKey(key)
    if (record !== undefined && key !== undefined) res.locals.sdk = { ...record, key }
    // The origin is echoed only for a request the key step admits, so that no refusal carries an
    // allow header; a 429 after the step does, and the page can read it.
    if (
      origin !== undefined &&
      !isSameOrigin(req) &&
      record?.origins.includes(origin) === true &&
      (record.enabled || isConfigRead(req))
    ) {
      res.set('Access-Control-Allow-Origin', origin)
    }
  } catch (error) {
    next(error)
    return
  }
  next()
}

// A preflight is counted on the address limit before any lookup, and a 429 carries no allow
// header. It is answered for an origin any key lists.
const preflight: RequestHandler = (req, res, next) => {
  if (!preflights.has(res)) {
    next()
    return
  }
  limitByIp(req, res, (error?: unknown) => {
    if (error !== undefined) {
      next(error)
      return
    }
    const origin = req.get('origin')
    isListedOrigin(origin).then((listed) => {
      if (listed && origin !== undefined) {
        res.set({
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': ALLOWED_METHODS,
          'Access-Control-Allow-Headers': ALLOWED_HEADERS,
          'Access-Control-Max-Age': PREFLIGHT_MAX_AGE,
        })
      }
      next()
    }, next)
  })
}

// 403 for no key, an unknown key, an origin the key does not list and a switched-off key on
// anything but a read of config: they look the same.
const requireKey: RequestHandler = (req, res, next) => {
  if (preflights.has(res)) {
    next()
    return
  }
  const record = res.locals.sdk
  const origin = req.get('origin')
  if (
    record === undefined ||
    (!isSameOrigin(req) && !record.origins.includes(origin ?? '')) ||
    (!record.enabled && !isConfigRead(req))
  ) {
    next(new AppError('forbidden', 'a valid SDK key for this origin is required'))
    return
  }
  next()
}

// The address first: a request it refuses never reaches the key's counter, so one address cannot
// use up an integration's limit. A preflight was counted already.
const limitRequestByIp: RequestHandler = (req, res, next) => {
  if (preflights.has(res)) next()
  else limitByIp(req, res, next)
}

export const sdkGate: RequestHandler[] = [cors, preflight, requireKey, limitRequestByIp, limitByKey]

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
// run already. Mount an entity the host page must not read with `frameOnly` (api/sdk/routes.ts).
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
