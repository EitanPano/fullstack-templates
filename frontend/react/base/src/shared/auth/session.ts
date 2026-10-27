import type { QueryClient } from '@tanstack/react-query'
import { redirect } from 'react-router'

import type { PublicUser } from '@/shared/api'
import { call } from '@/shared/api/call'
import { getApiUserMe } from '@/shared/api/generated'
import { getApiUserMeOptions } from '@/shared/api/generated/@tanstack/react-query.gen'
import { ActionError } from '@/shared/lib/action-error'

// The data access layer for the signed-in account. Every loader that depends on who is calling
// goes through `readSession`, `requireAccount` or `requireRole`; none trusts anything the page
// holds. The API decides on every call; a guard only keeps a visitor off a screen.
export type Role = PublicUser['role']

export const SIGN_IN_PATH = '/sign-in'
export const FORBIDDEN_PATH = '/forbidden'

// A session read stays fresh this long, so a burst of navigations asks the API once. Sign-in
// and sign-out write the cache themselves.
const SESSION_STALE_MS = 30_000

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

function isUnauthenticated(error: unknown): boolean {
  return error instanceof ActionError && error.code === 'unauthenticated'
}

// Who the cookies belong to, as the API says: `GET /api/user/me`. Null for a visitor and,
// failing closed, for an API that cannot answer.
export async function readSession(queryClient: QueryClient): Promise<PublicUser | null> {
  try {
    const user: unknown = await queryClient.query({
      ...getApiUserMeOptions(),
      // Same key as the account widgets' read, so it must reject the same way: with an
      // ActionError, whichever of the two ran the fetch first.
      queryFn: ({ signal }) => call(getApiUserMe({ signal })),
      staleTime: SESSION_STALE_MS,
    })
    return isUser(user) ? user : null
  } catch (error) {
    if (!isUnauthenticated(error)) console.error('[session] could not read the account', error)
    return null
  }
}

// The path a guard remembers, so sign-in can bring the visitor back.
export function returnToOf(request: Request): string {
  const url = new URL(request.url)
  return `${url.pathname}${url.search}`
}

// For a loader that needs an account: sends a visitor to sign-in, remembering `returnTo`.
export async function requireAccount(
  queryClient: QueryClient,
  returnTo?: string,
): Promise<PublicUser> {
  const user = await readSession(queryClient)
  if (user) return user
  throw redirect(returnTo ? `${SIGN_IN_PATH}?next=${encodeURIComponent(returnTo)}` : SIGN_IN_PATH)
}

// For a loader limited to one role: a visitor goes to sign-in, an account with another role to
// /forbidden. The API enforces the role again on its own routes.
export async function requireRole(
  queryClient: QueryClient,
  role: Role,
  returnTo?: string,
): Promise<PublicUser> {
  const user = await requireAccount(queryClient, returnTo)
  if (user.role !== role) throw redirect(FORBIDDEN_PATH)
  return user
}

// For the sign-in and sign-up loaders: an account that is already signed in goes home.
export async function redirectIfSignedIn(queryClient: QueryClient): Promise<null> {
  if (await readSession(queryClient)) throw redirect('/')
  return null
}
