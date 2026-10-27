import type { CreateClientConfig } from './generated/client.gen'
import { clearSessionHint, hasSessionHint } from './session-hint' // @server:auth

// The SPA's API client configuration, applied when `generated/client.gen.ts` creates the one
// client (the generator's `runtimeConfigPath`). Every call is relative `/api` on the page's own
// origin (the dev and preview servers, nginx or the server forward it), so the browser sends
// the API's HttpOnly cookies itself and no token is ever readable by JavaScript.
//
// The origin is explicit because the generated client builds a `Request`, which refuses a bare
// path outside a browser (Vitest). `fetch` is resolved per call so tests can stub it.

// @server:auth-start
const REFRESH_URL = '/api/auth/refresh'
// Sign-in, sign-up, the OTP calls and the refresh itself answer 401 for reasons a refresh cannot
// fix. Sign-out is not exempt: with only the refresh cookie left it needs one refresh to revoke
// the session.
const EXEMPT = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/otp',
  '/api/auth/otp/verification',
])

// Concurrent 401s share one refresh: the API rotates the refresh token, so a second refresh with
// the old cookie would be a replay.
let refreshing: Promise<boolean> | undefined

function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const response = await globalThis.fetch(
        new Request(new URL(REFRESH_URL, window.location.origin), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
          credentials: 'same-origin',
        }),
      )
      // The API refused the cookie (expired, revoked or reused) or got none: the browser drops the
      // refresh cookie when its max-age ends and the servers then answer 400 "refresh token
      // missing". The hint is stale, so forget it and the next 401 costs no refresh. A rate limit,
      // an outage or a network error say nothing about the cookie, so the hint stays.
      if ([400, 401, 403].includes(response.status)) clearSessionHint()
      return response.ok
    } catch {
      return false
    }
  })().finally(() => {
    refreshing = undefined
  })
  return refreshing
}

// Turns a 401 into one refresh and one retry, for a browser that signed in (the hint). When the
// refresh fails, the original 401 goes back to the caller (the route guards send the visitor to
// sign-in).
const fetchWithRefresh: typeof fetch = async (input, init) => {
  const request = new Request(input, init)
  // Cloned before the first send: a request body can be read only once.
  const retry = request.clone()
  const response = await globalThis.fetch(request)
  if (response.status !== 401) return response
  if (EXEMPT.has(new URL(request.url).pathname) || !hasSessionHint()) return response
  return (await refreshSession()) ? globalThis.fetch(retry) : response
}
// @server:auth-end

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: window.location.origin,
  credentials: 'same-origin',
  fetch: fetchWithRefresh, // @server:auth
})
