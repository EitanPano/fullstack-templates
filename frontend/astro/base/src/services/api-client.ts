// api-client.ts belongs: the generated client's configuration (openapi-ts.config.ts names this file
// as its `runtimeConfigPath`; the generated client.gen.ts applies it when it creates the one
// client). Every call is a relative /api path on the page's own origin, so no URL is compiled in
// and CORS stays off. The generated client builds a `Request`, which wants an absolute URL: the
// page's origin is read in the browser, when the client is created.
// It does not belong: error mapping (services/api.ts) or any call (a services/<entity>.ts).
import type { CreateClientConfig } from './generated/client.gen'

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: typeof window === 'undefined' ? '' : window.location.origin,
  credentials: 'same-origin',
  throwOnError: true,
})
