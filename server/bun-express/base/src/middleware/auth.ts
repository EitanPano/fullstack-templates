// auth.ts belongs: resolving the caller from the access token and guarding endpoints that need
// one. It does not belong: token creation (services/security/jwt.ts) or role checks (role.ts).
//
// The access token is stateless: a revoked session's access token stays valid until it expires
// (15 min). That is the stated tradeoff for not hitting the session store on every request.
import type { RequestHandler, Response } from 'express'

import type { Caller } from '../models/auth/type'
import { readAccessToken } from '../services/security/cookies'
import { verifyAccess } from '../services/security/jwt'
import { AppError } from '../services/utils/error'

// Never rejects: the OTP endpoints are optional-auth. An absent or invalid token leaves no caller.
export const authenticate: RequestHandler = async (req, res, next) => {
  try {
    const token = readAccessToken(req)
    if (token !== undefined) {
      const claims = await verifyAccess(token)
      if (claims !== null) {
        res.locals.caller = { id: claims.sub, role: claims.role, sessionId: claims.sid }
      }
    }
    next()
  } catch (error) {
    next(error)
  }
}

export const rejectAnonymous: RequestHandler = (_req, res, next) => {
  if (res.locals.caller === undefined) {
    next(new AppError('unauthenticated', 'authentication required'))
    return
  }
  next()
}

// One composed handler, not an array: TypeScript cannot infer the types of a later inline handler
// when an array precedes it (`router.get(path, requireAuth, (req, res) => ...)` would make
// req and res implicit any), so a route writes `router.get('/me', requireAuth, handler)`.
export const requireAuth: RequestHandler = (req, res, next) => {
  authenticate(req, res, (error?: unknown) => {
    if (error !== undefined) next(error)
    else rejectAnonymous(req, res, next)
  })
}

export function requireCaller(res: Response): Caller {
  const caller = res.locals.caller
  if (caller === undefined) throw new AppError('unauthenticated', 'authentication required')
  return caller
}
