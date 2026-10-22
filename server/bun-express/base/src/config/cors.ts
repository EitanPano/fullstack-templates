import type { CorsOptions } from 'cors'

import { env } from './env'

// CORS is off unless CORS_ORIGINS is set: the browser talks to the Next.js server, and the
// Next.js server (not the browser) is this API's client. Credentials are allowed only for the
// listed origins, never a wildcard.
export const corsOptions: CorsOptions | undefined =
  env.CORS_ORIGINS === undefined ? undefined : { origin: env.CORS_ORIGINS, credentials: true }
