import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http'
import { DOCUMENT } from '@angular/common'
import { Injector, inject } from '@angular/core'
import { Router } from '@angular/router'
import { catchError, from, switchMap, throwError } from 'rxjs'

import { toLogin } from '@app/core/guards/auth.guard'
import { LOGIN_PATH } from '@app/models/user/constant'
import { AuthStore } from '@app/store/auth.store'
import { SessionStore } from '@app/store/session.store'

// The server marks the one 401 a refresh can answer, a request with no valid access token, with a
// `WWW-Authenticate: Bearer` challenge. Wrong credentials, a wrong code and a refused refresh carry
// none, so no endpoint needs listing here.
const CHALLENGE = /^Bearer\b/i
// The refresh never refreshes itself, whatever its 401 carries: it would wait on its own promise.
const REFRESH_PATH = '/api/auth/refresh'

const ORIGIN = 'http://localhost'

function pathOf(url: string): string {
  return new URL(url, ORIGIN).pathname
}

function isChallenge(error: unknown): error is HttpErrorResponse {
  return (
    error instanceof HttpErrorResponse &&
    error.status === 401 &&
    CHALLENGE.test(error.headers.get('WWW-Authenticate') ?? '')
  )
}

// Only the app's own API: a relative `/api/...` URL, or an absolute one on this page's origin. A
// third-party URL gets neither the cookies nor a refresh.
function isOwnApi(url: string, pageOrigin: string): boolean {
  const parsed = new URL(url, pageOrigin)
  return parsed.origin === pageOrigin && /^\/api(\/|$)/.test(parsed.pathname)
}

// The session is over: send the visitor to login with the page they were on, unless the start-up
// probe is running (a visitor on a public page stays there) or they are already on login.
function toLoginAfterRefusal(injector: Injector): void {
  if (injector.get(AuthStore).restoring()) return
  const router = injector.get(Router)
  if (!router.url.startsWith(LOGIN_PATH)) void router.navigateByUrl(toLogin(router, []).redirectTo)
}

// The innermost interceptor. For the app's own `/api/` it sends the cookies and turns a challenged
// 401 into one refresh and one replay, for a browser that signed in (the session hint); any other
// URL passes through untouched. When the refresh fails the original 401 goes on, and the error
// interceptor above maps it. The stores are resolved on the first 401 through the Injector: they
// reach HttpClient through the SDK, so injecting them here would be a cycle.
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const injector = inject(Injector)
  const pageOrigin = inject(DOCUMENT).location.origin
  if (!isOwnApi(req.url, pageOrigin)) return next(req)
  const request = req.clone({ withCredentials: true })
  return next(request).pipe(
    catchError((error: unknown) => {
      if (!isChallenge(error) || pathOf(request.url) === REFRESH_PATH) {
        return throwError(() => error)
      }
      const session = injector.get(SessionStore)
      if (!session.active()) return throwError(() => error)
      return from(session.refresh()).pipe(
        switchMap((outcome) => {
          if (outcome === 'renewed') return next(request)
          if (outcome === 'refused') toLoginAfterRefusal(injector)
          return throwError(() => error)
        }),
      )
    }),
  )
}
