import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { installInterceptors } from '@/core/interceptors/http.provider'
import { emitSessionLost, setSessionHint } from '@/core/providers/session'
import { useAuthStore } from '@/store/auth.store'
import { USER } from '@/testing/auth-fixtures'
import { stubApi } from '@/testing/stub-api'
import { Page } from '@/testing/stubs'

import { initSession } from './session.initializer'

async function makeRouter(start: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Page },
      { path: '/profile', component: Page },
      { path: '/auth/login', component: Page },
    ],
  })
  await router.push(start)
  return router
}

describe('initSession', () => {
  let stop: () => void = () => undefined

  beforeAll(() => {
    installInterceptors()
  })

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    stop()
    vi.restoreAllMocks()
  })

  it('starts the session restore once at boot and returns without waiting for it', async () => {
    setSessionHint()
    const fetchMock = stubApi({ 'GET /api/user/me': Response.json(USER) })
    const router = await makeRouter('/')

    stop = initSession(router)

    const auth = useAuthStore()
    expect(auth.restoring).toBe(true)
    await auth.ready
    expect(auth.user).toEqual(USER)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('calls nothing without the hint', async () => {
    const fetchMock = stubApi({})
    const router = await makeRouter('/')

    stop = initSession(router)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('forgets the account and sends it to login with the page it was on when the session is lost', async () => {
    const auth = useAuthStore()
    auth.user = USER
    const router = await makeRouter('/profile')
    stop = initSession(router)

    emitSessionLost()
    await vi.waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/auth/login')
    })

    expect(auth.isLoggedIn).toBe(false)
    expect(router.currentRoute.value.query).toEqual({ next: '/profile' })
  })

  it('does not navigate when the visitor is already on a login URL', async () => {
    const auth = useAuthStore()
    auth.user = USER
    const router = await makeRouter('/auth/login')
    stop = initSession(router)

    emitSessionLost()

    expect(auth.isLoggedIn).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/auth/login')
  })

  it('does not bounce a visitor off a public page', async () => {
    const router = await makeRouter('/')
    stop = initSession(router)

    emitSessionLost()
    await Promise.resolve()

    expect(router.currentRoute.value.path).toBe('/')
  })

  it('leaves the navigation to the guards while the restore is running', async () => {
    setSessionHint()
    stubApi({ 'GET /api/user/me': () => new Promise<Response>(() => undefined) })
    const router = await makeRouter('/')
    stop = initSession(router)
    const auth = useAuthStore()
    auth.user = USER

    emitSessionLost()
    await Promise.resolve()

    expect(auth.restoring).toBe(true)
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('stops reacting once unsubscribed', async () => {
    const auth = useAuthStore()
    auth.user = USER
    const router = await makeRouter('/profile')
    stop = initSession(router)

    stop()
    emitSessionLost()

    expect(auth.isLoggedIn).toBe(true)
  })
})
