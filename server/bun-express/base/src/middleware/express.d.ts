// express.d.ts belongs: the shape of res.locals. Middleware is what writes it (request-id,
// authenticate, validate), so the shape is declared here, once, for every layer that reads it. // @auth
// validate), so the shape is declared here, once, for every layer that reads it. // @noauth
import type { Caller } from '../models/auth/type' // @auth
import type { SdkKeyRecord } from '../services/security/sdk-keys' // @sdk

declare global {
  namespace Express {
    interface Locals {
      requestId: string
      caller?: Caller // @auth
      input?: unknown
      // The key the SDK gate resolved, with its record. // @sdk
      sdk?: SdkKeyRecord & { key: string } // @sdk
    }
  }
}

export {}
