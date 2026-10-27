import 'server-only'

import { NextResponse, type NextRequest } from 'next/server'

import { createApi } from '@/shared/api/client'
import { postApiAuthRefresh } from '@/shared/api/generated'

import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  setSessionCookies,
  type SessionTokens,
} from './cookies'
import { isAccessTokenExpired } from './token'

export type Outcome =
  { kind: 'rotated'; tokens: SessionTokens } | { kind: 'refused' } | { kind: 'unavailable' }

// One refresh per refresh token at a time in this process. A page load fires several requests
// (document, prefetches, actions) with the same cookie; the API rotates the token, so a second
// refresh with the old one would be a replay. Across processes the API's own grace window
// answers a repeat with the same tokens.
//
// The cost of rotation: the API rotates the refresh token on every refresh. If the new token
// never reaches the browser (an aborted navigation, a dropped response) and the old one is
// replayed after the API's 30 s grace window, the API treats it as theft and revokes ALL the
// account's sessions. That is the API's reuse-detection policy; the proxy keeps the window short
// by refreshing at the start of a request, before any slow work.
const inflight = new Map<string, Promise<Outcome>>()

async function refresh(refreshToken: string, clientHeaders?: Headers): Promise<Outcome> {
  try {
    const { data, response, error } = await postApiAuthRefresh({
      client: createApi({ clientHeaders }),
      body: { refreshToken },
    })
    if (response?.ok && data) return { kind: 'rotated', tokens: data.tokens }
    // The API said no: the token is expired, revoked or reused.
    if (response && [400, 401, 403].includes(response.status)) return { kind: 'refused' }
    console.error('[session] refresh failed', { status: response?.status, error })
  } catch (cause) {
    console.error('[session] refresh failed', { cause })
  }
  // Rate limit, outage, anything else: say nothing about the session, keep the cookies.
  return { kind: 'unavailable' }
}

export function refreshTokens(refreshToken: string, clientHeaders?: Headers): Promise<Outcome> {
  const running = inflight.get(refreshToken)
  if (running) return running
  const started = refresh(refreshToken, clientHeaders).finally(() => inflight.delete(refreshToken))
  inflight.set(refreshToken, started)
  return started
}

// The proxy body. When the access token is missing or expired and a refresh token exists, it
// refreshes, rotates both cookies on the response and on the request this render reads, and on a
// refusal clears them. It never redirects and never checks a permission: a page or action that
// needs an account asks `requireAccount`, which reads the result.
export async function refreshSession(request: NextRequest): Promise<NextResponse> {
  const access = request.cookies.get(ACCESS_COOKIE)?.value
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value
  if (!refreshToken || (access && !isAccessTokenExpired(access))) return NextResponse.next()

  const outcome = await refreshTokens(refreshToken, request.headers)
  if (outcome.kind === 'unavailable') return NextResponse.next()

  if (outcome.kind === 'refused') {
    request.cookies.delete(ACCESS_COOKIE)
    request.cookies.delete(REFRESH_COOKIE)
    const response = NextResponse.next({ request })
    clearSessionCookies(response.cookies)
    return response
  }

  // The new tokens go on the request too, so the page rendered for it already sees them.
  request.cookies.set(ACCESS_COOKIE, outcome.tokens.accessToken)
  request.cookies.set(REFRESH_COOKIE, outcome.tokens.refreshToken)
  const response = NextResponse.next({ request })
  setSessionCookies(response.cookies, outcome.tokens)
  return response
}
