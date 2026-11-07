import { effect, inject, untracked } from '@angular/core'
import { patchState, signalStore, withHooks, withMethods, withState } from '@ngrx/signals'

import { LoggerService } from '@app/core/providers/logger.service'
import { NetworkService } from '@app/core/providers/network.service'
import { NotificationService } from '@app/core/providers/notification.service'
import { errorMessageKey } from '@app/models/api/error-copy'
import { ApiError, isApiError } from '@app/models/api/response'
import type { PublicUser, UpdateMeBody } from '@app/models/user/interface'
import { UserService } from '@app/services/user.service'

import { AuthStore } from './auth.store'
import { setError, setLoaded, setLoading, withRequestStatus } from './with-request-status'

interface UserState {
  profile: PublicUser | null
}

const INITIAL: UserState = { profile: null }

// The account's profile as the profile page reads and edits it. `AuthStore` answers who is signed
// in; this store holds the profile data, so a save here never touches the session. It holds an
// account's data, so it clears itself whenever nobody is signed in (sign-out, a refused refresh):
// the next account must never see, or save, this one's profile.
export const UserStore = signalStore(
  { providedIn: 'root' },
  withState<UserState>(INITIAL),
  withRequestStatus(),
  withMethods(
    (
      store,
      service = inject(UserService),
      network = inject(NetworkService),
      notifications = inject(NotificationService),
      logger = inject(LoggerService),
      auth = inject(AuthStore),
    ) => {
      const fail = (cause: unknown, context: string): void => {
        if (!isApiError(cause)) logger.error(`UserStore.${context} failed`, cause)
        const error = isApiError(cause) ? cause : new ApiError({ status: 0, code: 'unknown' })
        patchState(store, setError(error))
        if (error.code !== 'validation_failed') notifications.showError(errorMessageKey(error.code))
      }

      return {
        // Forgets the profile and the request outcome.
        reset(): void {
          patchState(store, INITIAL, { status: 'idle', error: null })
        },

        async load(): Promise<void> {
          // A profile of another account must not show while this one loads.
          patchState(store, INITIAL, setLoading())
          try {
            const profile = await service.me()
            // Signed out while the call was in flight: the answer belongs to nobody now.
            if (!auth.isLoggedIn()) return
            patchState(store, { profile }, setLoaded())
          } catch (cause) {
            fail(cause, 'load')
          }
        },

        // true once the server accepted the change. A validation failure stays in `error()` for the
        // page to put on its fields.
        async update(body: UpdateMeBody): Promise<boolean> {
          if (!network.online()) {
            notifications.showError('errors.offline')
            return false
          }
          patchState(store, setLoading())
          try {
            const profile = await service.update(body)
            if (auth.isLoggedIn()) patchState(store, { profile }, setLoaded())
            return true
          } catch (cause) {
            fail(cause, 'update')
            return false
          }
        },
      }
    },
  ),
  withHooks({
    onInit(store, auth = inject(AuthStore)) {
      effect(() => {
        if (auth.isLoggedIn()) return
        untracked(() => {
          store.reset()
        })
      })
    },
  }),
)
