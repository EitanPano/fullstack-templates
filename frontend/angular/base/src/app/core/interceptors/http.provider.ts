import { provideHttpClient, withInterceptors } from '@angular/common/http'

import { authInterceptor } from './auth.interceptor' // @server:auth
import { errorInterceptor } from './error.interceptor' // @server
import { loadingInterceptor } from './loading.interceptor'

// @server-start
// The HTTP stack, in the one order that works: loading is outermost (one exchange counts once,
// even when the auth interceptor replays a request), the error mapper sits inside it, and the auth
// interceptor is appended last so it runs innermost and sees the raw HttpErrorResponse. It lives
// here because only core/interceptors, core/config and services import the HTTP package.
// @server-end
// @noserver-start
// The HTTP stack: loading is the one interceptor. It lives here because only core/interceptors,
// core/config and services import the HTTP package.
// @noserver-end
export const HTTP_INTERCEPTORS_IN_ORDER = [
  loadingInterceptor,
  errorInterceptor, // @server
  authInterceptor, // @server:auth
]

export function provideHttp() {
  return provideHttpClient(withInterceptors(HTTP_INTERCEPTORS_IN_ORDER))
}
