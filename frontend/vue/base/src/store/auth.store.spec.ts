import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { hasSessionHint, setSessionHint } from '@/core/providers/session'
import { installInterceptors } from '@/core/interceptors/http.provider'
import { authService } from '@/services/auth.service'
import { ADMIN, envelope, SESSION, USER } from '@/testing/auth-fixtures'
import { stubApi } from '@/testing/stub-api'

import { SESSION_RESTORE_TIMEOUT_MS, useAuthStore } from './auth.store'
import { useNetworkStore } from './network.store'
import { useNotificationStore } from './notification.store'

const CREDENTIALS = { email: USER.email, password: 'a-long-password' }
const toastKeys = () => useNotificationStore().toasts.map((toast) => toast.messageKey)

describe('useAuthStore', () => {
  beforeAll(() => {
    installInterceptors()
  })

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('a visitor', () => {
    it('starts with no account, no roles and a settled ready', async () => {
      const store = useAuthStore()

      expect(store.user).toBeNull()
      expect(store.isLoggedIn).toBe(false)
      expect(store.roles).toEqual([])
      expect(store.restoring).toBe(false)
      await expect(store.ready).resolves.toBeUndefined()
    })

    it('calls nothing to restore a session without the hint', async () => {
      const fetchMock = stubApi({})
      const store = useAuthStore()

      await store.restoreSession()

      expect(fetchMock).not.toHaveBeenCalled()
      expect(store.isLoggedIn).toBe(false)
    })
  })

  describe('restoreSession', () => {
    beforeEach(() => {
      setSessionHint()
    })

    it('reads the account once with the hint set, and settles ready', async () => {
      stubApi({ 'GET /api/user/me': Response.json(USER) })
      const store = useAuthStore()
      let settled = false
      void store.ready.then(() => {
        settled = true
      })

      const pending = store.restoreSession()
      expect(store.restoring).toBe(true)
      await Promise.resolve()
      expect(settled).toBe(false)
      await pending

      expect(store.user).toEqual(USER)
      expect(store.isLoggedIn).toBe(true)
      expect(store.roles).toEqual(['user'])
      expect(store.restoring).toBe(false)
      expect(settled).toBe(true)
      expect(hasSessionHint()).toBe(true)
    })

    it('fails closed to a visitor on a 401 without logging, and keeps the hint', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      stubApi({ 'GET /api/user/me': envelope('unauthenticated', 401) })
      const store = useAuthStore()

      await store.restoreSession()

      expect(store.isLoggedIn).toBe(false)
      expect(store.restoring).toBe(false)
      expect(logged).not.toHaveBeenCalled()
      expect(hasSessionHint()).toBe(true)
      await expect(store.ready).resolves.toBeUndefined()
    })

    it('fails closed and logs any other failure, with no toast', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      stubApi({ 'GET /api/user/me': envelope('internal', 500) })
      const store = useAuthStore()

      await store.restoreSession()

      expect(store.isLoggedIn).toBe(false)
      expect(logged).toHaveBeenCalledOnce()
      expect(toastKeys()).toEqual([])
      expect(hasSessionHint()).toBe(true)
    })

    it('settles ready after the cap, discards a late answer and logs the timeout once', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      let answer: (response: Response) => void = () => undefined
      stubApi({
        'GET /api/user/me': () =>
          new Promise<Response>((resolve) => {
            answer = resolve
          }),
      })
      const store = useAuthStore()
      let settled = false
      void store.ready.then(() => {
        settled = true
      })

      const pending = store.restoreSession()
      await vi.advanceTimersByTimeAsync(SESSION_RESTORE_TIMEOUT_MS - 1)
      expect(settled).toBe(false)
      expect(store.restoring).toBe(true)

      await vi.advanceTimersByTimeAsync(1)
      expect(settled).toBe(true)
      expect(store.restoring).toBe(false)
      expect(logged).toHaveBeenCalledOnce()

      answer(Response.json(USER))
      await pending

      expect(store.isLoggedIn).toBe(false)
      expect(hasSessionHint()).toBe(true)
      expect(logged).toHaveBeenCalledOnce()
    })

    it('does not leave the cap timer running once the answer came', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      stubApi({ 'GET /api/user/me': Response.json(USER) })
      const store = useAuthStore()

      await store.restoreSession()

      expect(vi.getTimerCount()).toBe(0)
    })
  })

  describe('login', () => {
    it('keeps the account, sets the hint and toasts nothing', async () => {
      stubApi({ 'POST /api/auth/login': Response.json(SESSION) })
      const store = useAuthStore()

      const pending = store.login(CREDENTIALS)
      expect(store.loading).toBe(true)
      const worked = await pending

      expect(worked).toBe(true)
      expect(store.user).toEqual(USER)
      expect(store.loaded).toBe(true)
      expect(hasSessionHint()).toBe(true)
      expect(toastKeys()).toEqual([])
    })

    it('reads the role of an admin into roles', async () => {
      stubApi({ 'POST /api/auth/login': Response.json({ ...SESSION, user: ADMIN }) })
      const store = useAuthStore()

      await store.login(CREDENTIALS)

      expect(store.roles).toEqual(['admin'])
    })

    it('words a 401 as wrong credentials, leaves no hint and returns false', async () => {
      stubApi({ 'POST /api/auth/login': envelope('unauthenticated', 401) })
      const store = useAuthStore()

      const worked = await store.login(CREDENTIALS)

      expect(worked).toBe(false)
      expect(store.isLoggedIn).toBe(false)
      expect(hasSessionHint()).toBe(false)
      expect(store.error).toMatchObject({ code: 'unauthenticated', status: 401 })
      expect(toastKeys()).toEqual(['auth.login.invalid'])
    })

    it('leaves validation_failed in error for the page and toasts nothing', async () => {
      stubApi({
        'POST /api/auth/login': envelope('validation_failed', 422, [
          { path: 'email', message: 'x' },
        ]),
      })
      const store = useAuthStore()

      const worked = await store.login(CREDENTIALS)

      expect(worked).toBe(false)
      expect(store.error?.code).toBe('validation_failed')
      expect(store.error?.fieldErrors).toEqual({ email: ['invalid'] })
      expect(toastKeys()).toEqual([])
    })

    it('toasts the copy of any other code', async () => {
      stubApi({ 'POST /api/auth/login': envelope('rate_limited', 429) })
      const store = useAuthStore()

      await store.login(CREDENTIALS)

      expect(toastKeys()).toEqual(['errors.rate_limited'])
    })

    it('refuses while the browser is offline and calls nothing', async () => {
      const fetchMock = stubApi({})
      useNetworkStore().online = false
      const store = useAuthStore()

      const worked = await store.login(CREDENTIALS)

      expect(worked).toBe(false)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(toastKeys()).toEqual(['errors.offline'])
    })

    it('logs a cause that is no ApiError and shows errors.unknown', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      vi.spyOn(authService, 'login').mockRejectedValue(new Error('bug in the facade'))
      const store = useAuthStore()

      await store.login(CREDENTIALS)

      expect(logged).toHaveBeenCalled()
      expect(toastKeys()).toEqual(['errors.unknown'])
    })
  })

  describe('signup', () => {
    it('signs the new account in and sets the hint', async () => {
      stubApi({ 'POST /api/auth/signup': Response.json(SESSION, { status: 201 }) })
      const store = useAuthStore()

      const worked = await store.signup(CREDENTIALS)

      expect(worked).toBe(true)
      expect(store.user).toEqual(USER)
      expect(hasSessionHint()).toBe(true)
    })

    it('leaves a signup conflict in error for the page and toasts nothing', async () => {
      stubApi({ 'POST /api/auth/signup': envelope('conflict', 409) })
      const store = useAuthStore()

      const worked = await store.signup(CREDENTIALS)

      expect(worked).toBe(false)
      expect(store.error?.code).toBe('conflict')
      expect(store.isLoggedIn).toBe(false)
      expect(hasSessionHint()).toBe(false)
      expect(toastKeys()).toEqual([])
    })
  })

  describe('logout', () => {
    async function signedIn() {
      stubApi({ 'POST /api/auth/login': Response.json(SESSION) })
      const store = useAuthStore()
      await store.login(CREDENTIALS)
      return store
    }

    it('signs out on the server, clears the hint and the account', async () => {
      const store = await signedIn()
      const fetchMock = stubApi({ 'POST /api/auth/logout': new Response(null, { status: 204 }) })

      const worked = await store.logout()

      expect(worked).toBe(true)
      expect(store.isLoggedIn).toBe(false)
      expect(hasSessionHint()).toBe(false)
      expect(fetchMock).toHaveBeenCalledOnce()
    })

    it('still signs out when the session is already gone (401)', async () => {
      const store = await signedIn()
      stubApi({ 'POST /api/auth/logout': envelope('unauthenticated', 401) })

      const worked = await store.logout()

      expect(worked).toBe(true)
      expect(store.isLoggedIn).toBe(false)
      expect(hasSessionHint()).toBe(false)
      expect(toastKeys()).toEqual([])
    })

    it('keeps the account on screen, with its toast, when the server fails', async () => {
      const store = await signedIn()
      stubApi({ 'POST /api/auth/logout': envelope('internal', 500) })

      const worked = await store.logout()

      expect(worked).toBe(false)
      expect(store.isLoggedIn).toBe(true)
      expect(hasSessionHint()).toBe(true)
      expect(toastKeys()).toEqual(['errors.internal'])
    })

    it('refuses while offline', async () => {
      const store = await signedIn()
      useNetworkStore().online = false

      expect(await store.logout()).toBe(false)
      expect(store.isLoggedIn).toBe(true)
      expect(toastKeys()).toEqual(['errors.offline'])
    })
  })

  describe('forget', () => {
    it('drops the account in memory and leaves the hint to the wrapper', async () => {
      stubApi({ 'POST /api/auth/login': Response.json(SESSION) })
      const store = useAuthStore()
      await store.login(CREDENTIALS)

      store.forget()

      expect(store.isLoggedIn).toBe(false)
      expect(store.roles).toEqual([])
    })
  })

  describe('the OTP flow', () => {
    async function signedIn() {
      stubApi({ 'POST /api/auth/login': Response.json(SESSION) })
      const store = useAuthStore()
      await store.login(CREDENTIALS)
      return store
    }

    it('asks for a code to the signed-in address', async () => {
      const store = await signedIn()
      const fetchMock = stubApi({ 'POST /api/auth/otp': Response.json({}, { status: 202 }) })

      expect(await store.requestOtp()).toBe(true)

      const request = fetchMock.mock.calls[0]?.[0] as unknown as Request
      expect(await request.clone().json()).toEqual({
        target: { type: 'email', value: USER.email },
        purpose: 'verify',
      })
    })

    it('verifies the code and keeps the verified account', async () => {
      const store = await signedIn()
      const verified = { ...USER, emailVerifiedAt: '2026-01-02T00:00:00.000Z' }
      stubApi({ 'POST /api/auth/otp/verification': Response.json({ user: verified }) })

      expect(await store.verifyOtp('123456')).toBe(true)

      expect(store.user).toEqual(verified)
    })

    it('does nothing for a visitor', async () => {
      const fetchMock = stubApi({})
      const store = useAuthStore()

      expect(await store.requestOtp()).toBe(false)
      expect(await store.verifyOtp('123456')).toBe(false)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('leaves a wrong code (422) for the page and toasts nothing', async () => {
      const store = await signedIn()
      stubApi({
        'POST /api/auth/otp/verification': envelope('validation_failed', 422, [
          { path: 'code', message: 'x' },
        ]),
      })

      expect(await store.verifyOtp('000000')).toBe(false)

      expect(store.error?.fieldErrors).toEqual({ code: ['invalid'] })
      expect(toastKeys()).toEqual([])
    })

    it('toasts a failed request for a code', async () => {
      const store = await signedIn()
      stubApi({ 'POST /api/auth/otp': envelope('rate_limited', 429) })

      expect(await store.requestOtp()).toBe(false)

      expect(toastKeys()).toEqual(['errors.rate_limited'])
    })
  })
})
