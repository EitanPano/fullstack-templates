import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { logger } from '@/core/providers/logger'
import { clearSessionHint, hasSessionHint, setSessionHint } from '@/core/providers/session'
import { errorMessageKey } from '@/core/config/error-copy'
import type { ApiErrorCode } from '@/models/api/type'
import { isApiError } from '@/services/api-error'
import type { Credentials, PublicUser } from '@/models/user/type'
import { authService } from '@/services/auth.service'
import { userService } from '@/services/user.service'

import { useNetworkStore } from './network.store'
import { useNotificationStore } from './notification.store'
import { useRequestStatus } from './request-status'

// How long a guarded deep link may wait for the API before the app goes ahead as a visitor.
export const SESSION_RESTORE_TIMEOUT_MS = 5000

// A `null` value means the page shows this code itself (on a field): the store toasts nothing.
type Overrides = Partial<Record<ApiErrorCode, string | null>>

function isUnauthenticated(cause: unknown): boolean {
  return isApiError(cause) && cause.code === 'unauthenticated'
}

// Who is signed in. The session is two HttpOnly cookies; the page only ever holds the account the
// server returned and a flag in local storage (the session hint: "this browser signed in", never
// a token) that spares a visitor the refresh attempt a 401 would cost. A method behind a form
// returns whether it worked and leaves a failure in `error`; it has already toasted every code but
// `validation_failed`, which the page puts on its fields.
//
// The refresh itself is not here: core/interceptors/auth.interceptor.ts does it (this store
// reaches the client through a facade, so the wrapper cannot import it) and tells the app through
// `sessionLost`; core/initializers/session.initializer.ts calls `forget()`.
export const useAuthStore = defineStore('auth', () => {
  const request = useRequestStatus()
  const network = useNetworkStore()
  const notifications = useNotificationStore()

  const user = ref<PublicUser | null>(null)
  // True while the start-up read of /api/user/me runs: a refused refresh then must not send a
  // visitor on a public page to login (the guards protect the guarded routes).
  const restoring = ref(false)

  const isLoggedIn = computed(() => user.value !== null)
  const roles = computed<readonly string[]>(() => (user.value ? [user.value.role] : []))

  // Settles when the session restore settles, or after the cap; with no hint it is settled at once,
  // so a visitor never waits. The guards await it before deciding.
  let settleReady: () => void = () => undefined
  const ready = new Promise<void>((resolve) => {
    settleReady = resolve
  })
  if (!hasSessionHint()) settleReady()

  // The offline rule: a mutation does not send while the browser reports no connection.
  function offline(): boolean {
    if (network.online) return false
    notifications.showError('errors.offline')
    return true
  }

  // Records the failure and toasts its copy once. `overrides` names a better message for a code
  // in one call (a 401 from login means wrong credentials, not an expired session).
  function fail(cause: unknown, context: string, overrides: Overrides = {}): void {
    const apiError = request.fail(cause, `auth.${context}`)
    if (apiError.code === 'validation_failed') return
    const override = overrides[apiError.code]
    if (override === null) return
    notifications.showError(override ?? errorMessageKey(apiError.code))
  }

  async function enter(
    context: string,
    call: () => Promise<{ user: PublicUser }>,
    overrides: Overrides,
  ): Promise<boolean> {
    if (offline()) return false
    request.setLoading()
    try {
      const session = await call()
      setSessionHint()
      user.value = session.user
      request.setLoaded()
      return true
    } catch (cause) {
      fail(cause, context, overrides)
      return false
    }
  }

  // Reads the account the cookies belong to, once, at start-up. Without the hint nothing is
  // called. Failing closed: any failure leaves a visitor. It never clears the hint itself: a 401
  // from /me has already tried one refresh (the fetch wrapper), and only a refused refresh clears
  // it; a refresh lost to an outage says nothing about the cookies. After the cap the app is a
  // visitor for good: a late answer is discarded, the hint stays, and the timeout is logged once.
  async function restoreSession(): Promise<void> {
    if (!hasSessionHint()) {
      settleReady()
      return
    }
    const attempt = { discarded: false }
    request.setLoading()
    restoring.value = true
    const timer = setTimeout(() => {
      attempt.discarded = true
      restoring.value = false
      request.setLoaded()
      settleReady()
      logger.error('Restoring the session timed out; starting as a visitor')
    }, SESSION_RESTORE_TIMEOUT_MS)
    try {
      const account = await userService.me()
      if (!attempt.discarded) {
        user.value = account
        request.setLoaded()
      }
    } catch (cause) {
      if (!attempt.discarded) {
        // A 401 here was refused by the refresh, which has cleared the hint; anything else is news.
        if (!isUnauthenticated(cause)) logger.error('auth.restoreSession failed', cause)
        user.value = null
        request.setLoaded()
      }
    } finally {
      clearTimeout(timer)
      if (!attempt.discarded) restoring.value = false
      settleReady()
    }
  }

  function login(credentials: Credentials): Promise<boolean> {
    return enter('login', () => authService.login(credentials), {
      unauthenticated: 'auth.login.invalid',
    })
  }

  function signup(credentials: Credentials): Promise<boolean> {
    return enter('signup', () => authService.signup(credentials), {
      conflict: null,
    })
  }

  // Signs out on the server, then here. A 401 means the session is already gone, so that still
  // signs out; any other failure keeps the account on screen with its error toast. The page
  // navigates home after a true.
  async function logout(): Promise<boolean> {
    if (offline()) return false
    request.setLoading()
    try {
      await authService.logout()
    } catch (cause) {
      if (!isUnauthenticated(cause)) {
        fail(cause, 'logout')
        return false
      }
    }
    clearSessionHint()
    user.value = null
    request.setLoaded()
    return true
  }

  // The session is over (a refused refresh): drop the account. The wrapper has cleared the hint.
  function forget(): void {
    user.value = null
  }

  // Asks the server to mail a code to the signed-in account's address.
  async function requestOtp(): Promise<boolean> {
    const account = user.value
    if (!account || offline()) return false
    request.setLoading()
    try {
      await authService.requestOtp({
        target: { type: 'email', value: account.email },
        purpose: 'verify',
      })
      request.setLoaded()
      return true
    } catch (cause) {
      fail(cause, 'requestOtp')
      return false
    }
  }

  async function verifyOtp(code: string): Promise<boolean> {
    const account = user.value
    if (!account || offline()) return false
    request.setLoading()
    try {
      const verified = await authService.verifyOtp({
        target: { type: 'email', value: account.email },
        purpose: 'verify',
        code,
      })
      user.value = verified.user
      request.setLoaded()
      return true
    } catch (cause) {
      fail(cause, 'verifyOtp')
      return false
    }
  }

  return {
    ...request,
    user,
    restoring,
    ready,
    isLoggedIn,
    roles,
    restoreSession,
    login,
    signup,
    logout,
    forget,
    requestOtp,
    verifyOtp,
  }
})
