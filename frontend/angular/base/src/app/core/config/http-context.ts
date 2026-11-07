import { HttpContextToken } from '@angular/common/http'

// Set on a request that should not move the global loading indicator (a poll, a prefetch):
// `new HttpContext().set(BACKGROUND, true)`. It lives in core/config so services and the loading
// interceptor can both import it. The generated SDK takes no HttpContext, so only a facade that
// uses HttpClient directly (like the file upload) can set it.
export const BACKGROUND = new HttpContextToken<boolean>(() => false)
