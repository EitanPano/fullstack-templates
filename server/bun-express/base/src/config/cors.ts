import type { CorsOptions } from 'cors'

import { env } from './env'

// CORS is off unless CORS_ORIGINS is set: no browser calls the API from another origin (the
// frontend reaches it through its own origin). Credentials are allowed only for the listed
// origins, never a wildcard.
export const corsOptions: CorsOptions | undefined =
  env.CORS_ORIGINS === undefined ? undefined : { origin: env.CORS_ORIGINS, credentials: true }
