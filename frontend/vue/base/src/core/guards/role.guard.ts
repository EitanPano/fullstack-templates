import type { NavigationGuard } from 'vue-router'

import { FORBIDDEN_PATH } from '@/core/config/constants'
import { useAuthStore } from '@/store/auth.store'

import { toLogin } from './auth.guard'

// A route limited to some roles: `{ beforeEnter: roleGuard, meta: { roles: ['admin'] } }`. A
// visitor goes to sign-in with `next`; an account with another role goes to /forbidden. A route
// with no `meta.roles` is open to any account. The role is the API's answer and the API enforces
// it again on its own routes.
export const roleGuard: NavigationGuard = async (to) => {
  const auth = useAuthStore()
  await auth.ready
  if (!auth.isLoggedIn) return toLogin(to)
  const wanted: unknown = to.meta['roles']
  const roles = Array.isArray(wanted) ? (wanted as unknown[]) : []
  if (roles.length === 0 || roles.some((role) => auth.roles.includes(String(role)))) return true
  return FORBIDDEN_PATH
}
