import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { installInterceptors } from '@/core/interceptors/http.provider'
import { userService } from '@/services/user.service'
import { envelope, USER } from '@/testing/auth-fixtures'
import { stubApi } from '@/testing/stub-api'

import { useAuthStore } from './auth.store'
import { useNetworkStore } from './network.store'
import { useNotificationStore } from './notification.store'
import { useUserStore } from './user.store'

const toastKeys = () => useNotificationStore().toasts.map((toast) => toast.messageKey)

// A response the test releases when it chooses.
function deferred() {
  const state: { release: (response: Response) => void } = { release: () => undefined }
  const promise = new Promise<Response>((resolve) => {
    state.release = resolve
  })
  return {
    promise,
    release: (response: Response) => {
      state.release(response)
    },
  }
}

function signedIn() {
  const auth = useAuthStore()
  auth.user = USER
  return auth
}

describe('useUserStore', () => {
  beforeAll(() => {
    installInterceptors()
  })

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts idle with no profile', () => {
    const store = useUserStore()

    expect(store.profile).toBeNull()
    expect(store.status).toBe('idle')
  })

  it('loads the profile', async () => {
    signedIn()
    stubApi({ 'GET /api/user/me': Response.json(USER) })
    const store = useUserStore()

    const pending = store.load()
    expect(store.loading).toBe(true)
    await pending

    expect(store.profile).toEqual(USER)
    expect(store.loaded).toBe(true)
  })

  it('drops the old profile before it loads', async () => {
    const auth = signedIn()
    stubApi({ 'GET /api/user/me': Response.json(USER) })
    const store = useUserStore()
    await store.load()
    auth.user = { ...USER, id: 'u9', email: 'other@example.com' }

    const later = deferred()
    stubApi({ 'GET /api/user/me': () => later.promise })
    const pending = store.load()

    expect(store.profile).toBeNull()
    later.release(Response.json({ ...USER, id: 'u9' }))
    await pending
    expect(store.profile?.id).toBe('u9')
  })

  it('ignores an answer that arrives after sign-out', async () => {
    const auth = signedIn()
    const later = deferred()
    stubApi({ 'GET /api/user/me': () => later.promise })
    const store = useUserStore()

    const pending = store.load()
    auth.forget()
    later.release(Response.json(USER))
    await pending

    expect(store.profile).toBeNull()
  })

  it('keeps the ApiError and toasts its copy when the load fails', async () => {
    signedIn()
    stubApi({ 'GET /api/user/me': envelope('internal', 500) })
    const store = useUserStore()

    await store.load()

    expect(store.failed).toBe(true)
    expect(store.error).toMatchObject({ code: 'internal', status: 500 })
    expect(toastKeys()).toEqual(['errors.internal'])
  })

  it('logs a cause that is no ApiError and shows errors.unknown', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    signedIn()
    vi.spyOn(userService, 'me').mockRejectedValue(new Error('bug'))
    const store = useUserStore()

    await store.load()

    expect(logged).toHaveBeenCalled()
    expect(toastKeys()).toEqual(['errors.unknown'])
  })

  it('clears itself when the account signs out', async () => {
    const auth = signedIn()
    stubApi({ 'GET /api/user/me': Response.json(USER) })
    const store = useUserStore()
    await store.load()

    auth.forget()

    expect(store.profile).toBeNull()
    expect(store.status).toBe('idle')
    expect(store.error).toBeNull()
  })

  it('keeps the profile while an account stays signed in', async () => {
    const auth = signedIn()
    stubApi({ 'GET /api/user/me': Response.json(USER) })
    const store = useUserStore()
    await store.load()

    auth.user = { ...USER, emailVerifiedAt: '2026-01-02T00:00:00.000Z' }

    expect(store.profile).toEqual(USER)
  })

  describe('update', () => {
    it('saves the phone number and keeps the answer', async () => {
      signedIn()
      stubApi({ 'PATCH /api/user/me': Response.json({ ...USER, phone: '+14155550132' }) })
      const store = useUserStore()

      const worked = await store.update({ phone: '+14155550132' })

      expect(worked).toBe(true)
      expect(store.profile?.phone).toBe('+14155550132')
      expect(store.loaded).toBe(true)
    })

    it('does not keep an answer that arrives after sign-out', async () => {
      const auth = signedIn()
      const later = deferred()
      stubApi({ 'PATCH /api/user/me': () => later.promise })
      const store = useUserStore()

      const pending = store.update({ phone: null })
      auth.forget()
      later.release(Response.json(USER))
      await pending

      expect(store.profile).toBeNull()
    })

    it('leaves validation_failed in error for the page and toasts nothing', async () => {
      signedIn()
      stubApi({
        'PATCH /api/user/me': envelope('validation_failed', 422, [{ path: 'phone', message: 'x' }]),
      })
      const store = useUserStore()

      const worked = await store.update({ phone: '+1' })

      expect(worked).toBe(false)
      expect(store.error?.fieldErrors).toEqual({ phone: ['invalid'] })
      expect(toastKeys()).toEqual([])
    })

    it('toasts any other failure', async () => {
      signedIn()
      stubApi({ 'PATCH /api/user/me': envelope('internal', 500) })
      const store = useUserStore()

      expect(await store.update({ phone: null })).toBe(false)

      expect(toastKeys()).toEqual(['errors.internal'])
    })

    it('refuses while offline and calls nothing', async () => {
      signedIn()
      const fetchMock = stubApi({})
      useNetworkStore().online = false
      const store = useUserStore()

      expect(await store.update({ phone: null })).toBe(false)

      expect(fetchMock).not.toHaveBeenCalled()
      expect(toastKeys()).toEqual(['errors.offline'])
    })
  })
})
