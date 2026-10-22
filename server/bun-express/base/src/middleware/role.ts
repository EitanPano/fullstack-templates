// role.ts belongs: the declarative role gate of a route. It does not belong: ownership or
// other per-record rules (service.ts).
//
// The route gate is declarative and fails fast; the service still checks the forwarded caller
// (plan 004 A4).
import type { RequestHandler } from 'express'

import type { UserRole } from '../models/user/enum'
import { AppError } from '../services/utils/error'
import { requireAuth, requireCaller } from './auth'

// requireRole('admin') alone guards an endpoint: it authenticates first (anonymous is a 401,
// a caller with the wrong role a 403). One composed handler, for the reason given in auth.ts.
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, res, next) => {
    requireAuth(req, res, (error?: unknown) => {
      if (error !== undefined) {
        next(error)
        return
      }
      // requireAuth guarantees a caller; requireCaller narrows the type without a dead branch.
      if (!roles.includes(requireCaller(res).role)) {
        next(new AppError('forbidden', 'insufficient role'))
        return
      }
      next()
    })
  }
}
