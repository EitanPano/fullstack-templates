import 'server-only'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { cache } from 'react'

import type { PublicUser } from '@/shared/api'
import { createRequestApi } from '@/shared/api/client'
import { getApiUserMe } from '@/shared/api/generated'

import { ACCESS_COOKIE } from './cookies'

// The data access layer for the signed-in account. Every page, loader and action that depends
// on who is calling goes through `readSession`, `requireAccount` or `requireRole`; none of them
// trusts the token's own claims. `proxy.ts` only keeps the tokens fresh, it never decides access.
export type Session = { user: PublicUser; accessToken: string }
export type Role = PublicUser['role']

export const SIGN_IN_PATH = '/sign-in'
export const FORBIDDEN_PATH = '/forbidden'

// Who the access cookie belongs to, as the API says: `GET /api/user/me` with the token as a
// bearer, once per request (React `cache`). Null for no cookie, a token the API refuses, and,
// failing closed, an API that cannot answer. Never call it inside `'use cache'`: it reads cookies.
export const readSession = cache(async (): Promise<Session | null> => {
  const accessToken = (await cookies()).get(ACCESS_COOKIE)?.value
  if (!accessToken) return null
  // The API call is request-time work: without this a runtime prerender runs it and the client
  // swallows the abort as an error.
  await connection()

  const { data, response, error } = await getApiUserMe({
    client: await createRequestApi({ accessToken }),
  })
  if (response?.ok && isUser(data)) return { user: data, accessToken }
  if (response?.status !== 401) console.error('[session] could not read the account', { error })
  return null
})

function isUser(value: unknown): value is PublicUser {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'role' in value &&
    (value.role === 'user' || value.role === 'admin')
  )
}

// For a page, layout or loader that needs an account: sends a visitor to sign-in, remembering
// `returnTo` (the page's own path) so sign-in can bring them back.
export async function requireAccount(returnTo?: string): Promise<Session> {
  const session = await readSession()
  if (session) return session
  redirect(returnTo ? `${SIGN_IN_PATH}?next=${encodeURIComponent(returnTo)}` : SIGN_IN_PATH)
}

// For a route or loader limited to one role: a visitor goes to sign-in (remembering `returnTo`),
// an account with another role to the /forbidden page. The server API enforces the role again
// on its own routes.
export async function requireRole(role: Role, returnTo?: string): Promise<Session> {
  const session = await requireAccount(returnTo)
  if (session.user.role !== role) redirect(FORBIDDEN_PATH)
  return session
}
