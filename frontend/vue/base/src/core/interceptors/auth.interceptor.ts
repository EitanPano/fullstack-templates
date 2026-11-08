import { clearSessionHint, emitSessionLost, hasSessionHint } from '@/core/providers/session'

const REFRESH_PATH = '/api/auth/refresh'

// Sign-in, sign-up, the OTP calls and the refresh itself answer 401 for reasons a refresh cannot
// fix. Sign-out is not exempt: with only the refresh cookie left it needs one refresh to revoke
// the session.
const EXEMPT = new Set([
  '/api/auth/login',
  '/api/auth/register',
  REFRESH_PATH,
  '/api/auth/otp',
  '/api/auth/otp/verification',
])

// The API refused the cookie (expired, revoked or reused) or got none: the browser drops the
// refresh cookie when its max-age ends and the servers then answer 400 "refresh token missing".
const REFUSED = new Set([400, 401, 403])

// Concurrent 401s share one refresh: the API rotates the refresh token, so a second refresh with
// the old cookie would be a replay.
let refreshing: Promise<boolean> | undefined

function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const response = await globalThis.fetch(
        new Request(new URL(REFRESH_PATH, window.location.origin), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
          credentials: 'same-origin',
        }),
      )
      // The hint is stale, so forget it and the next 401 costs no refresh, and tell the app the
      // session is over. A rate limit, an outage or a network error say nothing about the cookie,
      // so the hint stays.
      if (REFUSED.has(response.status)) {
        clearSessionHint()
        emitSessionLost()
      }
      return response.ok
    } catch {
      return false
    }
  })().finally(() => {
    refreshing = undefined
  })
  return refreshing
}

// Only the app's own API is refreshed: a 401 from another origin, or from a path outside /api,
// says nothing about our session.
function isOwnApi(url: URL): boolean {
  return url.origin === window.location.origin && /^\/api(\/|$)/.test(url.pathname)
}

// A fetch wrapper that turns a 401 into one refresh and one retry, for a browser that signed in
// (the hint). When the refresh fails the original 401 goes back to the caller and the error
// interceptor maps it. Without `inner` it reads the global fetch on every call, so a test can
// stub it. This file is a leaf of the client config: it imports nothing that imports the client.
export function withRefresh(inner?: typeof fetch): typeof fetch {
  return async (input, init) => {
    const send = inner ?? globalThis.fetch
    const request = new Request(input, init)
    // Cloned before the first send: a request body can be read only once.
    const retry = request.clone()
    const response = await send(request)
    if (response.status !== 401) return response
    const url = new URL(request.url)
    if (!isOwnApi(url) || EXEMPT.has(url.pathname) || !hasSessionHint()) return response
    return (await refreshSession()) ? send(retry) : response
  }
}
