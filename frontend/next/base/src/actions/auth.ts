'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { call } from '@/services/call'
import { createRequestApi } from '@/services/client'
import { postApiAuthLogin, postApiAuthLogout, postApiAuthRegister } from '@/services/generated'
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  setSessionCookies,
} from '@/core/auth/cookies'
import { safeNextPath } from '@/core/auth/next-path'
import { refreshTokens } from '@/core/auth/refresh'
import { SIGN_IN_PATH } from '@/core/auth/session'
import { action } from '@/core/actions/safe-action'

import { SIGN_IN_COPY, SIGN_UP_COPY, signInSchema, signUpSchema } from '@/models/auth'

// The API's tokens go into this server's own cookies (shared/auth/cookies.ts); the browser never
// holds them in JavaScript. A success redirects, so these actions return data only on failure.
export const signIn = action.inputSchema(signInSchema).action(async ({ parsedInput }) => {
  const { email, password, next } = parsedInput
  const session = await call(
    postApiAuthLogin({ client: await createRequestApi(), body: { email, password } }),
    SIGN_IN_COPY,
    { schema: signInSchema },
  )
  setSessionCookies(await cookies(), session.tokens)
  redirect(safeNextPath(next))
})

export const signUp = action.inputSchema(signUpSchema).action(async ({ parsedInput }) => {
  const { email, password, next } = parsedInput
  const session = await call(
    postApiAuthRegister({ client: await createRequestApi(), body: { email, password } }),
    SIGN_UP_COPY,
    { schema: signUpSchema, fields: { conflict: 'email' } },
  )
  setSessionCookies(await cookies(), session.tokens)
  redirect(safeNextPath(next))
})

// Revokes the session at the API, then clears the cookies whatever the API said: a visitor who
// asked to sign out is signed out here even if the server session lives until it expires. When
// only the refresh cookie is left (the access cookie expired), one refresh gets a token that can
// revoke the session; skipping it would leave the refresh session alive for its 30 days.
export const signOut = action.action(async () => {
  const jar = await cookies()
  let accessToken = jar.get(ACCESS_COOKIE)?.value
  const refreshToken = jar.get(REFRESH_COOKIE)?.value
  if (!accessToken && refreshToken) {
    const outcome = await refreshTokens(refreshToken, await headers())
    if (outcome.kind === 'rotated') accessToken = outcome.tokens.accessToken
  }
  if (accessToken) {
    try {
      await call(postApiAuthLogout({ client: await createRequestApi({ accessToken }), body: {} }))
    } catch (error) {
      console.error('[auth] sign-out could not revoke the session', error)
    }
  }
  clearSessionCookies(jar)
  redirect(SIGN_IN_PATH)
})
