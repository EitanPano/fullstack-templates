// sdk-gate.ts belongs: the one gate of /api/sdk/v1, in order: CORS for this namespace alone, the
// publishable key, then the rate limit by key and by address. api/sdk/routes.ts mounts it first.
// It does not belong: the key lookup (services/security/sdk-keys.ts) or the limits' values
// (config/constants.ts). No cookie is read here, and no response sends Allow-Credentials.
import type { Request, RequestHandler } from 'express'

import { RATE_LIMITS } from '../config/constants'
import { isListedOrigin, originsForKey } from '../services/security/sdk-keys'
import { AppError } from '../services/utils/error'
import { byIp, rateLimit } from './rate-limit'

export const SDK_KEY_HEADER = 'x-sdk-key'

const ALLOWED_METHODS = 'GET, POST'
const ALLOWED_HEADERS = `${SDK_KEY_HEADER}, content-type`
// One preflight answers repeated calls for ten minutes.
const PREFLIGHT_MAX_AGE = '600'

function keyOf(req: Request): string | undefined {
  return req.get(SDK_KEY_HEADER)
}

// A same-origin request (the frame on our own origin) lists no key origin and needs a valid key
// only; a browser still sends Origin on a same-origin POST. The raw Host header is compared, host
// and port only, so a proxy that ends TLS or forwards Host plays no part.
export function isSameOrigin(req: Request): boolean {
  const origin = req.get('origin')
  if (origin === undefined || req.get('sec-fetch-site') === 'same-origin') return true
  try {
    return new URL(origin).host.toLowerCase() === req.get('host')?.toLowerCase()
  } catch {
    return false
  }
}

// The browser's side of the gate. A preflight carries no key, so it is answered for an origin any
// key lists and the key step sees only the real request. A request with no Origin (the frame, on
// our own origin) needs none of this.
const cors: RequestHandler = (req, res, next) => {
  const origin = req.get('origin')
  res.vary('Origin')
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
    res.status(204).end()
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
const requireKey: RequestHandler = (req, _res, next) => {
  const origins = originsForKey(keyOf(req))
  const origin = req.get('origin')
  if (origins === undefined || (!isSameOrigin(req) && !origins.includes(origin ?? ''))) {
    next(new AppError('forbidden', 'a valid SDK key for this origin is required'))
    return
  }
  next()
}

const limitByKey = rateLimit({ name: 'sdkPerKey', ...RATE_LIMITS.sdkPerKey, key: keyOf })
const limitByIp = rateLimit({ name: 'sdkPerIp', ...RATE_LIMITS.sdkPerIp, key: byIp })

export const sdkGate: RequestHandler[] = [cors, requireKey, limitByKey, limitByIp]
