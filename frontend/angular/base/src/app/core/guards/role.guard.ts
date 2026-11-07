import { inject } from '@angular/core'
import {
  RedirectCommand,
  Router,
  type CanMatchFn,
  type Route,
  type UrlSegment,
} from '@angular/router'

import { FORBIDDEN_PATH } from '@app/models/user/constants'
import { AuthStore } from '@app/store/auth.store'

import { toLogin } from './auth.guard'

// A route limited to some roles: `{ canMatch: [roleGuard], data: { roles: ['admin'] } }`. A visitor
// goes to sign-in with `next`; an account with another role goes to /forbidden. A route with no
// `data.roles` is open to any account. The API enforces the role again on its own routes.
export const roleGuard: CanMatchFn = (route: Route, segments: UrlSegment[]) => {
  const auth = inject(AuthStore)
  const router = inject(Router)
  if (!auth.isLoggedIn()) return toLogin(router, segments)
  const wanted: unknown = route.data?.['roles']
  const roles = Array.isArray(wanted) ? (wanted as unknown[]) : []
  if (roles.length === 0 || roles.some((role) => auth.roles().includes(String(role)))) return true
  return new RedirectCommand(router.parseUrl(FORBIDDEN_PATH))
}
