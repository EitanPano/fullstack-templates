import { inject } from '@angular/core'
import { patchState, signalStore, withHooks, withMethods, withState } from '@ngrx/signals'

import { STORAGE_KEYS } from '@app/core/config/constants'
import { LoggerService } from '@app/core/providers/logger.service'
import { StorageService } from '@app/core/providers/storage.service'
import { isApiError } from '@app/services/api-error'
import { AuthService } from '@app/services/auth.service'

// renewed: the cookies were renewed. refused: the server ended the session for good. failed: an
// outage or a bug, which says nothing about the cookies.
export type RefreshOutcome = 'renewed' | 'refused' | 'failed'

// A refresh the server refused for good: the cookie is expired, revoked, reused or missing.
const REFUSED = new Set([400, 401, 403])
const SESSION_HINT = '1'

// The session protocol, apart from who is signed in (AuthStore). The session is two HttpOnly
// cookies; this store keeps only a flag in local storage, the session hint ("this browser signed
// in", never a token), which spares a visitor the refresh a 401 would cost, and the one shared
// refresh the auth interceptor and the start-up probe wait on.
export const SessionStore = signalStore(
  { providedIn: 'root' },
  withState({ active: false }),
  withMethods(
    (
      store,
      auth = inject(AuthService),
      storage = inject(StorageService),
      logger = inject(LoggerService),
    ) => {
      // Concurrent 401s share one refresh: the server rotates the refresh token, so a second
      // refresh with the old cookie would be a replay.
      let refreshing: Promise<RefreshOutcome> | null = null

      const end = (): void => {
        storage.remove(STORAGE_KEYS.session)
        patchState(store, { active: false })
      }

      return {
        start(): void {
          storage.set(STORAGE_KEYS.session, SESSION_HINT)
          patchState(store, { active: true })
        },

        end,

        refresh(): Promise<RefreshOutcome> {
          refreshing ??= (async (): Promise<RefreshOutcome> => {
            try {
              await auth.refresh()
              return 'renewed'
            } catch (cause) {
              if (isApiError(cause) && REFUSED.has(cause.status)) {
                end()
                return 'refused'
              }
              logger.error('SessionStore.refresh failed', cause)
              return 'failed'
            }
          })().finally(() => {
            refreshing = null
          })
          return refreshing
        },
      }
    },
  ),
  withHooks({
    onInit(store, storage = inject(StorageService)) {
      patchState(store, { active: storage.get(STORAGE_KEYS.session) === SESSION_HINT })
    },
  }),
)
