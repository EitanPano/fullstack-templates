import { redirect } from 'react-router'

import { FORBIDDEN_PATH, SIGN_IN_PATH } from '@/core/config/constants'
import { isUser, type Role, type User } from '@/models/user'
import { userApi } from '@/services/user.api'
import type { AppStore } from '@/store'

// The loaders' view of who is calling. Every loader that depends on the account goes through
// `readSession`, `requireAccount` or `requireRole`; none trusts anything the page holds. The API
// decides on every call; a guard only keeps a visitor off a screen. A guard redirects by throwing
// React Router's `redirect()` Response, which is the loader contract.

// Who the cookies belong to, as the API says: the `getMe` cache entry, fetched if it is missing or
// stale. Null for a visitor (the API's 401 is cached as null, not an error) and, failing closed and
// logged, for an API that cannot answer. The subscription is released at once; the entry stays cached for the
// account menu's hook to find.
export async function readSession(store: AppStore): Promise<User | null> {
  const subscription = store.dispatch(userApi.endpoints.getMe.initiate())
  try {
    const user: unknown = await subscription.unwrap()
    return isUser(user) ? user : null
  } catch (error) {
    console.error('[session] could not read the account', error)
    return null
  } finally {
    subscription.unsubscribe()
  }
}

// The path a guard remembers, so sign-in can bring the visitor back.
export function returnToOf(request: Request): string {
  const url = new URL(request.url)
  return `${url.pathname}${url.search}`
}

// For a loader that needs an account: sends a visitor to sign-in, remembering `returnTo`.
export async function requireAccount(store: AppStore, returnTo?: string): Promise<User> {
  const user = await readSession(store)
  if (user) return user
  throw redirect(returnTo ? `${SIGN_IN_PATH}?next=${encodeURIComponent(returnTo)}` : SIGN_IN_PATH)
}

// For a loader limited to one role: a visitor goes to sign-in, an account with another role to
// /forbidden. The API enforces the role again on its own routes.
export async function requireRole(store: AppStore, role: Role, returnTo?: string): Promise<User> {
  const user = await requireAccount(store, returnTo)
  if (user.role !== role) throw redirect(FORBIDDEN_PATH)
  return user
}

// For the sign-in and sign-up loaders: an account that is already signed in goes home.
export async function redirectIfSignedIn(store: AppStore): Promise<null> {
  if (await readSession(store)) throw redirect('/')
  return null
}
