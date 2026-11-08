import type { NavigationGuard, RouteLocationRaw } from 'vue-router'

import { LOGIN_PATH } from '@/core/config/constants'
import { NEXT_PARAM } from '@/models/user/constants'
import { useAuthStore } from '@/store/auth.store'

// Sign-in with the page the visitor was heading to, query included, so sign-in can bring them
// back. `safeNextPath` reads it again on the login page: only a path on this site is followed.
export function toLogin(target: { fullPath: string }): RouteLocationRaw {
  return { path: LOGIN_PATH, query: { [NEXT_PARAM]: target.fullPath } }
}

// A route that needs an account (`beforeEnter: authGuard`): a visitor goes to sign-in with `next`.
// It waits for the session restore first (at most the cap), so a returning account is not sent
// away and a protected page is never shown before the answer. The server decides on every call;
// this only keeps a visitor off a screen.
export const authGuard: NavigationGuard = async (to) => {
  const auth = useAuthStore()
  await auth.ready
  return auth.isLoggedIn ? true : toLogin(to)
}
