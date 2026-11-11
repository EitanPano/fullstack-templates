import { computed, inject } from '@angular/core'
import { Router } from '@angular/router'
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals'

import { STORAGE_KEYS } from '@app/core/config/constants'
import { LoggerService } from '@app/core/providers/logger.service'
import { NetworkService } from '@app/core/providers/network.service'
import { NotificationService } from '@app/core/providers/notification.service'
import { StorageService } from '@app/core/providers/storage.service'
import { errorMessageKey } from '@app/core/config/error-copy'
import type { ApiErrorCode } from '@app/models/api/type'
import { ApiError, isApiError } from '@app/services/api-error'
import type { Credentials, PublicUser } from '@app/models/user/type'
import { AuthService } from '@app/services/auth.service'
import { UserService } from '@app/services/user.service'

import { setError, setLoaded, setLoading, withRequestStatus } from './with-request-status'

interface AuthState {
  user: PublicUser | null
  // True while the start-up probe of /api/user/me runs: a refused refresh then must not send a
  // visitor on a public page to login (the guards protect the guarded routes).
  restoring: boolean
}

type Overrides = Partial<Record<ApiErrorCode, string>>

// A refresh the server refused for good: the cookie is expired, revoked, reused or missing.
const REFUSED = new Set([400, 401, 403])
const SESSION_HINT = '1'

// Who is signed in. The session is two HttpOnly cookies; the page only ever holds the account the
// server returned and a flag in local storage (the session hint: "this browser signed in", never a
// token) that spares a visitor the refresh attempt a 401 would cost. A method behind a form returns
// whether it worked and leaves a failure in `error()`; it has already toasted every code but
// `validation_failed`, which the page puts on its fields.
export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState<AuthState>({ user: null, restoring: false }),
  withRequestStatus(),
  withComputed(({ user }) => ({
    isLoggedIn: computed(() => user() !== null),
    roles: computed<readonly string[]>(() => {
      const current = user()
      return current ? [current.role] : []
    }),
  })),
  withMethods(
    (
      store,
      auth = inject(AuthService),
      users = inject(UserService),
      storage = inject(StorageService),
      network = inject(NetworkService),
      notifications = inject(NotificationService),
      logger = inject(LoggerService),
      router = inject(Router),
    ) => {
      // Concurrent 401s share one refresh: the server rotates the refresh token, so a second
      // refresh with the old cookie would be a replay.
      let refreshing: Promise<boolean> | null = null

      const hasSessionHint = (): boolean => storage.get(STORAGE_KEYS.session) === SESSION_HINT
      const clearHint = (): void => {
        storage.remove(STORAGE_KEYS.session)
      }

      // The offline rule: a mutation does not send while the browser reports no connection.
      const offline = (): boolean => {
        if (network.online()) return false
        notifications.showError('errors.offline')
        return true
      }

      // Records the failure and toasts its copy once. `overrides` names a better message for a code
      // in one call (a 401 from login means wrong credentials, not an expired session).
      const fail = (cause: unknown, context: string, overrides: Overrides = {}): void => {
        if (!isApiError(cause)) logger.error(`AuthStore.${context} failed`, cause)
        const error = isApiError(cause) ? cause : new ApiError({ status: 0, code: 'unknown' })
        patchState(store, setError(error))
        if (error.code === 'validation_failed') return
        notifications.showError(overrides[error.code] ?? errorMessageKey(error.code))
      }

      const enter = async (
        context: string,
        call: () => Promise<{ user: PublicUser }>,
        overrides: Overrides,
      ): Promise<boolean> => {
        if (offline()) return false
        patchState(store, setLoading())
        try {
          const { user } = await call()
          storage.set(STORAGE_KEYS.session, SESSION_HINT)
          patchState(store, { user }, setLoaded())
          return true
        } catch (cause) {
          fail(cause, context, overrides)
          return false
        }
      }

      return {
        hasSessionHint,

        // Reads the account the cookies belong to, once, at start-up. Without the hint nothing is
        // called. Failing closed: any failure leaves the visitor signed out. It never forgets the
        // hint itself: a 401 from /me has already tried one refresh (the auth interceptor), and
        // only a refused refresh clears it; a refresh lost to an outage says nothing about the
        // cookies.
        async restoreSession(): Promise<void> {
          if (!hasSessionHint()) return
          patchState(store, setLoading(), { restoring: true })
          try {
            patchState(store, { user: await users.me() }, setLoaded())
          } catch (cause) {
            // A 401 that reaches here was refused by the refresh, which has logged nothing and
            // cleared the hint, or lost to an outage, which has logged it.
            if (!(isApiError(cause) && cause.code === 'unauthenticated')) {
              logger.error('AuthStore.restoreSession failed', cause)
            }
            patchState(store, { user: null }, setLoaded())
          } finally {
            patchState(store, { restoring: false })
          }
        },

        login(credentials: Credentials): Promise<boolean> {
          return enter('login', () => auth.login(credentials), {
            unauthenticated: 'auth.login.invalid',
          })
        },

        signup(credentials: Credentials): Promise<boolean> {
          return enter('signup', () => auth.signup(credentials), {
            conflict: 'auth.signup.conflict',
          })
        },

        // Signs out on the server, then here. A 401 means the session is already gone, so that
        // still signs out; any other failure keeps the account on screen with its error toast.
        async logout(): Promise<boolean> {
          if (offline()) return false
          patchState(store, setLoading())
          try {
            await auth.logout()
          } catch (cause) {
            if (!(isApiError(cause) && cause.code === 'unauthenticated')) {
              fail(cause, 'logout')
              return false
            }
          }
          clearHint()
          patchState(store, { user: null }, setLoaded())
          await router.navigateByUrl('/')
          return true
        },

        // One shared in-flight refresh. true: the cookies were renewed. A 400, 401 or 403 means the
        // session is over: forget the hint and the account. A network error or a 5xx says nothing
        // about the cookies: false, and the hint stays.
        refresh(): Promise<boolean> {
          refreshing ??= (async () => {
            try {
              await auth.refresh()
              return true
            } catch (cause) {
              if (isApiError(cause) && REFUSED.has(cause.status)) {
                clearHint()
                patchState(store, { user: null })
              } else {
                logger.error('AuthStore.refresh failed', cause)
              }
              return false
            }
          })().finally(() => {
            refreshing = null
          })
          return refreshing
        },

        // Asks the server to mail a code to the signed-in account's address.
        async requestOtp(): Promise<boolean> {
          const user = store.user()
          if (!user || offline()) return false
          patchState(store, setLoading())
          try {
            await auth.requestOtp({
              target: { type: 'email', value: user.email },
              purpose: 'verify',
            })
            patchState(store, setLoaded())
            return true
          } catch (cause) {
            fail(cause, 'requestOtp')
            return false
          }
        },

        async verifyOtp(code: string): Promise<boolean> {
          const user = store.user()
          if (!user || offline()) return false
          patchState(store, setLoading())
          try {
            const verified = await auth.verifyOtp({
              target: { type: 'email', value: user.email },
              purpose: 'verify',
              code,
            })
            patchState(store, { user: verified.user }, setLoaded())
            return true
          } catch (cause) {
            fail(cause, 'verifyOtp')
            return false
          }
        },
      }
    },
  ),
)
