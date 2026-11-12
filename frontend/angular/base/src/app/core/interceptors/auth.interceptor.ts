import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http'
import { DOCUMENT } from '@angular/common'
import { Injector, inject } from '@angular/core'
import { Router } from '@angular/router'
import { catchError, from, switchMap, throwError } from 'rxjs'

import { toLogin } from '@app/core/guards/auth.guard'
import { LOGIN_PATH } from '@app/models/user/constant'
import { AuthStore } from '@app/store/auth.store'

// Sign-in, sign-up, the OTP calls and the refresh itself answer 401 for reasons a refresh cannot
// fix. Sign-out is not exempt: with only the refresh cookie left it needs one refresh to revoke
// the session. The generated client passes no HttpContext, so the exemption is by URL.
const EXEMPT_PATHS: ReadonlySet<string> = new Set([
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/refresh',
  '/api/auth/otp',
  '/api/auth/otp/verification',
])

const ORIGIN = 'http://localhost'

function pathOf(url: string): string {
  return new URL(url, ORIGIN).pathname
}

// Only the app's own API: a relative `/api/...` URL, or an absolute one on this page's origin. A
// third-party URL gets neither the cookies nor a refresh.
function isOwnApi(url: string, pageOrigin: string): boolean {
  const parsed = new URL(url, pageOrigin)
  return parsed.origin === pageOrigin && /^\/api(\/|$)/.test(parsed.pathname)
}

// The innermost interceptor. For the app's own `/api/` it sends the cookies and turns a 401 into
// one refresh and one replay, for a browser that signed in (the session hint); any other URL passes
// through untouched. When the refresh fails the original 401 goes
// on, and the error interceptor above maps it. AuthStore is resolved on the first 401 through the
// Injector: the store reaches HttpClient through the SDK, so injecting it here would be a cycle.
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const injector = inject(Injector)
  const pageOrigin = inject(DOCUMENT).location.origin
  if (!isOwnApi(req.url, pageOrigin)) return next(req)
  const request = req.clone({ withCredentials: true })
  return next(request).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error)
      }
      if (EXEMPT_PATHS.has(pathOf(request.url))) return throwError(() => error)
      const auth = injector.get(AuthStore)
      if (!auth.hasSessionHint()) return throwError(() => error)
      return from(auth.refresh()).pipe(
        switchMap((renewed) => {
          if (renewed) return next(request)
          // The refresh was refused (the hint is gone): the session is over, so send the visitor
          // to login with the page they were on, unless the start-up probe is running.
          if (!auth.hasSessionHint() && !auth.restoring()) {
            const router = injector.get(Router)
            if (!router.url.startsWith(LOGIN_PATH))
              void router.navigateByUrl(toLogin(router, []).redirectTo)
          }
          return throwError(() => error)
        }),
      )
    }),
  )
}
