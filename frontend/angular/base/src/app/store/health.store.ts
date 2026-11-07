import { inject } from '@angular/core'
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals'

import { LoggerService } from '@app/core/providers/logger.service'
import { NotificationService } from '@app/core/providers/notification.service'
import { errorMessageKey } from '@app/models/api/error-copy'
import { ApiError, isApiError } from '@app/models/api/response'
import type { HealthResponse } from '@app/models/health/interface'
import { HealthService } from '@app/services/health.service'

import { setError, setLoaded, setLoading, withRequestStatus } from './with-request-status'

interface HealthState {
  health: HealthResponse | null
  checkedAt: string | null
}

// The server's liveness, as the home page reads it. `load()` is the recipe every store method
// follows: set the status, await the facade, patch the state, and on an ApiError show the
// copy-table message once (`errors.<code>`, `errors.unknown` when the table has none). A read has
// no offline check; a mutation first asks `NetworkService.online()` and toasts `errors.offline`
// instead of sending.
export const HealthStore = signalStore(
  { providedIn: 'root' },
  withState<HealthState>({ health: null, checkedAt: null }),
  withRequestStatus(),
  withMethods(
    (
      store,
      service = inject(HealthService),
      notifications = inject(NotificationService),
      logger = inject(LoggerService),
    ) => ({
      async load(): Promise<void> {
        patchState(store, setLoading())
        try {
          const health = await service.get()
          patchState(store, { health, checkedAt: new Date().toISOString() }, setLoaded())
        } catch (cause) {
          if (!isApiError(cause)) logger.error('HealthStore.load failed', cause)
          const error = isApiError(cause) ? cause : new ApiError({ status: 0, code: 'unknown' })
          patchState(store, setError(error))
          notifications.showError(errorMessageKey(error.code))
        }
      },
    }),
  ),
)
