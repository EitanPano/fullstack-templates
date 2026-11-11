import { inject } from '@angular/core'
import {
  RedirectCommand,
  Router,
  type CanMatchFn,
  type Route,
  type UrlSegment,
} from '@angular/router'

import { LOGIN_PATH, NEXT_PARAM } from '@app/models/user/constant'
import { AuthStore } from '@app/store/auth.store'

// The path the visitor was heading to, query included, so sign-in can bring them back. A canMatch
// guard sees the navigation being matched; the segments are the fallback when it is not exposed.
export function attemptedPath(router: Router, segments: readonly UrlSegment[]): string {
  const url = router.currentNavigation()?.extractedUrl
  if (url) return router.serializeUrl(url)
  if (segments.length === 0) return router.url
  return '/' + segments.map((segment) => segment.path).join('/')
}

export function toLogin(router: Router, segments: readonly UrlSegment[]): RedirectCommand {
  const tree = router.createUrlTree([LOGIN_PATH], {
    queryParams: { [NEXT_PARAM]: attemptedPath(router, segments) },
  })
  return new RedirectCommand(tree)
}

// A route that needs an account: a visitor goes to sign-in with `next`. The server decides on every
// call; this only keeps a visitor off a screen.
export const authGuard: CanMatchFn = (_route: Route, segments: UrlSegment[]) => {
  if (inject(AuthStore).isLoggedIn()) return true
  return toLogin(inject(Router), segments)
}

// The sign-in and register screens: an account that is already signed in goes home.
export const guestGuard: CanMatchFn = () => {
  if (!inject(AuthStore).isLoggedIn()) return true
  return new RedirectCommand(inject(Router).parseUrl('/'))
}
