import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { installInterceptors } from '@/core/interceptors/http.provider'
import { setSessionHint } from '@/core/providers/session'
import { SESSION_RESTORE_TIMEOUT_MS, useAuthStore } from '@/store/auth.store'
import { ADMIN, USER } from '@/testing/auth-fixtures'
import { stubApi } from '@/testing/stub-api'
import { Page } from '@/testing/stubs'

import { authGuard } from './auth.guard'
import { guestGuard } from './guest.guard'
import { roleGuard } from './role.guard'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Page },
      { path: '/profile', component: Page, beforeEnter: authGuard },
      { path: '/admin', component: Page, beforeEnter: roleGuard, meta: { roles: ['admin'] } },
      { path: '/members', component: Page, beforeEnter: roleGuard },
      { path: '/forbidden', component: Page },
      { path: '/auth/login', component: Page, beforeEnter: guestGuard },
      { path: '/auth/register', component: Page, beforeEnter: guestGuard },
    ],
  })
}

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

describe('the route guards', () => {
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

  describe('authGuard', () => {
    it('sends a visitor to login with the path and query they wanted', async () => {
      const router = makeRouter()

      await router.push('/profile?tab=2')

      expect(router.currentRoute.value.path).toBe('/auth/login')
      expect(router.currentRoute.value.query).toEqual({ next: '/profile?tab=2' })
    })

    it('lets an account through', async () => {
      useAuthStore().user = USER
      const router = makeRouter()

      await router.push('/profile')

      expect(router.currentRoute.value.path).toBe('/profile')
    })

    it('holds a guarded deep link until the session restore answers, then lets the account in', async () => {
      setSessionHint()
      const me = deferred()
      stubApi({ 'GET /api/user/me': () => me.promise })
      const auth = useAuthStore()
      const restoring = auth.restoreSession()
      const router = makeRouter()

      let landed = false
      const navigation = router.push('/profile').then(() => {
        landed = true
      })
      await Promise.resolve()
      await Promise.resolve()
      expect(landed).toBe(false)
      expect(router.currentRoute.value.path).toBe('/')

      me.release(Response.json(USER))
      await restoring
      await navigation

      expect(router.currentRoute.value.path).toBe('/profile')
    })

    it('sends the visitor to login once the restore fails', async () => {
      setSessionHint()
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      stubApi({
        'GET /api/user/me': Response.json({ error: { code: 'internal' } }, { status: 500 }),
      })
      const auth = useAuthStore()
      void auth.restoreSession()
      const router = makeRouter()

      await router.push('/profile')

      expect(router.currentRoute.value.path).toBe('/auth/login')
      expect(router.currentRoute.value.query).toEqual({ next: '/profile' })
    })

    it('never shows the page when the cap fires first, and discards the late answer', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      setSessionHint()
      const me = deferred()
      stubApi({ 'GET /api/user/me': () => me.promise })
      const auth = useAuthStore()
      const restoring = auth.restoreSession()
      const router = makeRouter()

      const navigation = router.push('/profile')
      await vi.advanceTimersByTimeAsync(SESSION_RESTORE_TIMEOUT_MS)
      await navigation

      expect(router.currentRoute.value.path).toBe('/auth/login')
      expect(router.currentRoute.value.query).toEqual({ next: '/profile' })

      me.release(Response.json(USER))
      await restoring

      expect(auth.isLoggedIn).toBe(false)
      expect(router.currentRoute.value.path).toBe('/auth/login')
    })
  })

  describe('roleGuard', () => {
    it('sends a visitor to login with next', async () => {
      const router = makeRouter()

      await router.push('/admin')

      expect(router.currentRoute.value.path).toBe('/auth/login')
      expect(router.currentRoute.value.query).toEqual({ next: '/admin' })
    })

    it('sends an account with another role to forbidden', async () => {
      useAuthStore().user = USER
      const router = makeRouter()

      await router.push('/admin')

      expect(router.currentRoute.value.path).toBe('/forbidden')
    })

    it('lets an account with the role in', async () => {
      useAuthStore().user = ADMIN
      const router = makeRouter()

      await router.push('/admin')

      expect(router.currentRoute.value.path).toBe('/admin')
    })

    it('opens a route that names no role to any account', async () => {
      useAuthStore().user = USER
      const router = makeRouter()

      await router.push('/members')

      expect(router.currentRoute.value.path).toBe('/members')
    })

    it('waits for the restore before it judges the role', async () => {
      setSessionHint()
      const me = deferred()
      stubApi({ 'GET /api/user/me': () => me.promise })
      const auth = useAuthStore()
      const restoring = auth.restoreSession()
      const router = makeRouter()

      const navigation = router.push('/admin')
      me.release(Response.json(ADMIN))
      await restoring
      await navigation

      expect(router.currentRoute.value.path).toBe('/admin')
    })
  })

  describe('guestGuard', () => {
    it('shows login and register to a visitor', async () => {
      const router = makeRouter()

      await router.push('/auth/register')

      expect(router.currentRoute.value.path).toBe('/auth/register')
    })

    it('sends an account on login home', async () => {
      useAuthStore().user = USER
      const router = makeRouter()
      await router.push('/profile')

      await router.push('/auth/login')

      expect(router.currentRoute.value.path).toBe('/')
    })

    it('waits for the restore: a returning account never sees the login form', async () => {
      setSessionHint()
      const me = deferred()
      stubApi({ 'GET /api/user/me': () => me.promise })
      const auth = useAuthStore()
      const restoring = auth.restoreSession()
      const router = makeRouter()

      const navigation = router.push('/auth/login')
      me.release(Response.json(USER))
      await restoring
      await navigation

      expect(router.currentRoute.value.path).toBe('/')
    })
  })
})
