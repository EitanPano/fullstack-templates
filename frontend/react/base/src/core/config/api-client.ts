import type { CreateClientConfig } from '@/services/generated/client.gen'

// The SPA's API client configuration, applied when `generated/client.gen.ts` creates the one
// client (the generator's `runtimeConfigPath`). Every call is relative `/api` on the page's own
// origin (the dev and preview servers, nginx or the server forward it), so the browser sends
// the API's HttpOnly cookies itself and no token is ever readable by JavaScript.
//
// The origin is explicit because the generated client builds a `Request`, which refuses a bare
// path outside a browser (Vitest). `fetch` is resolved per call so tests can stub it.
export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: window.location.origin,
  credentials: 'same-origin',
})
