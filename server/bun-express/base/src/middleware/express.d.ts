// express.d.ts belongs: the shape of res.locals. Middleware is what writes it (request-id,
// authenticate, validate), so the shape is declared here, once, for every layer that reads it. // @auth
// validate), so the shape is declared here, once, for every layer that reads it. // @noauth
import type { Caller } from '../models/auth/type' // @auth

declare global {
  namespace Express {
    interface Locals {
      requestId: string
      caller?: Caller // @auth
      input?: unknown
    }
  }
}

export {}
