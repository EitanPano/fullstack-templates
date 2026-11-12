import { computed, inject } from '@angular/core'
import { Router } from '@angular/router'
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals'

import { LoggerService } from '@app/core/providers/logger.service'
import { DROPPED } from '@app/models/api/constant'
import type { Outcome } from '@app/models/api/type'
import type { AuthSession, Credentials, OtpVerified, PublicUser } from '@app/models/user/type'
import { isApiError } from '@app/services/api-error'
import { AuthService } from '@app/services/auth.service'
import { UserService } from '@app/services/user.service'

import { SessionStore } from './session.store'
import { withRequestStatus } from './with-request-status'

interface AuthState {
  // The account the server returned; `user` shows it only while the session is active, so a
  // session that ends (a refused refresh) forgets it with no code of its own.
  _account: PublicUser | null
}

// Who is signed in. The session itself (the hint, the refresh) is SessionStore. A method behind a
// form resolves to an `Outcome` and leaves `validation_failed` to the page; every other failure
// is toasted once by the call.
export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState<AuthState>({ _account: null }),
  withRequestStatus({
    store: 'AuthStore',
    calls: ['restore', 'login', 'signup', 'logout', 'requestOtp', 'verifyOtp'],
  }),
  withComputed(({ _account, loading }, session = inject(SessionStore)) => {
    const user = computed(() => (session.active() ? _account() : null))
    return {
      user,
      isLoggedIn: computed(() => user() !== null),
      roles: computed<readonly string[]>(() => {
        const current = user()
        return current ? [current.role] : []
      }),
      // True while the start-up probe of /api/user/me runs: a refused refresh then must not send
      // a visitor on a public page to login (the guards protect the guarded routes).
      restoring: computed(() => loading('restore')),
    }
  }),
  withMethods(
    (
      store,
      auth = inject(AuthService),
      users = inject(UserService),
      session = inject(SessionStore),
      logger = inject(LoggerService),
      router = inject(Router),
    ) => {
      const signIn = ({ user }: AuthSession): void => {
        session.start()
        patchState(store, { _account: user })
      }

      return {
        // Reads the account the cookies belong to, once, at start-up. Without the hint nothing is
        // called. Failing closed: any failure leaves the visitor signed out, with no toast. It
        // never ends the session itself: a 401 from /me has already tried one refresh (the auth
        // interceptor), and only a refused refresh ends it. A 401 is the expected answer for a
        // session that is gone, so it is not logged; the call logs a bug, this logs an outage.
        async restoreSession(): Promise<void> {
          if (!session.active()) return
          await store._call(
            'restore',
            () =>
              users.me().catch((cause: unknown) => {
                if (isApiError(cause) && cause.code !== 'unauthenticated') {
                  logger.error('AuthStore.restore failed', cause)
                }
                throw cause
              }),
            {
              silent: true,
              onSuccess: (account) => {
                patchState(store, { _account: account })
              },
            },
          )
        },

        login(credentials: Credentials): Promise<Outcome<AuthSession>> {
          return store._call('login', () => auth.login(credentials), {
            mutation: true,
            form: true,
            overrides: { unauthenticated: 'auth.login.invalid' },
            onSuccess: signIn,
          })
        },

        signup(credentials: Credentials): Promise<Outcome<AuthSession>> {
          return store._call('signup', () => auth.signup(credentials), {
            mutation: true,
            form: true,
            overrides: { conflict: 'auth.signup.conflict' },
            onSuccess: signIn,
          })
        },

        // Signs out on the server, then here, and goes home. A 401 means the session is already
        // gone, so that still signs out; any other failure keeps the account on screen.
        async logout(): Promise<Outcome<void>> {
          const result = await store._call(
            'logout',
            () =>
              auth.logout().catch((cause: unknown) => {
                if (isApiError(cause) && cause.code === 'unauthenticated') return
                throw cause
              }),
            {
              mutation: true,
              onSuccess: () => {
                session.end()
                patchState(store, { _account: null })
              },
            },
          )
          if (result.ok) await router.navigateByUrl('/')
          return result
        },

        // Asks the server to mail a code to the signed-in account's address.
        requestOtp(): Promise<Outcome<void>> {
          const user = store.user()
          if (!user) return Promise.resolve(DROPPED)
          return store._call(
            'requestOtp',
            () =>
              auth.requestOtp({ target: { type: 'email', value: user.email }, purpose: 'verify' }),
            { mutation: true },
          )
        },

        verifyOtp(code: string): Promise<Outcome<OtpVerified>> {
          const user = store.user()
          if (!user) return Promise.resolve(DROPPED)
          return store._call(
            'verifyOtp',
            () =>
              auth.verifyOtp({
                target: { type: 'email', value: user.email },
                purpose: 'verify',
                code,
              }),
            {
              mutation: true,
              form: true,
              onSuccess: (verified) => {
                patchState(store, { _account: verified.user })
              },
            },
          )
        },
      }
    },
  ),
)
