import type { HttpInterceptorFn } from '@angular/common/http'
import { inject } from '@angular/core'
import { finalize } from 'rxjs'

import { BACKGROUND } from '../config/http-context'
import { LoadingService } from '../providers/loading.service'

// Counts every request in flight on LoadingService, so `busy` is true until the last one settles.
// It is the outermost interceptor: a request the auth interceptor replays is still one exchange.
// `finalize` also stops the count when the caller unsubscribes (a cancelled upload).
export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(BACKGROUND)) return next(req)
  const loading = inject(LoadingService)
  loading.start()
  return next(req).pipe(
    finalize(() => {
      loading.stop()
    }),
  )
}
