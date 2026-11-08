import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { useAuthStore } from '@/store/auth.store'
import { ADMIN, USER } from '@/testing/auth-fixtures'

import { routes } from './routes'

function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes })
}

// The composed table: what a visitor and an account reach, through the real guards.
describe('the route table with auth', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('sends a visitor on a guarded deep link to login with the path and query', async () => {
    const router = makeRouter()

    await router.push('/profile?tab=phone')

    expect(router.currentRoute.value.path).toBe('/auth/login')
    expect(router.currentRoute.value.query).toEqual({ next: '/profile?tab=phone' })
  })

  it('keeps the account screens out of the shell: login sits under the auth layout', async () => {
    const router = makeRouter()

    await router.push('/auth/login')

    expect(router.currentRoute.value.matched.map((record) => record.path)).toEqual([
      '/auth',
      '/auth/login',
    ])
  })

  it('sends /auth to login', async () => {
    const router = makeRouter()

    await router.push('/auth')

    expect(router.currentRoute.value.path).toBe('/auth/login')
  })

  it('opens the profile to an account', async () => {
    useAuthStore().user = USER
    const router = makeRouter()

    await router.push('/profile')

    expect(router.currentRoute.value.path).toBe('/profile')
    expect(router.currentRoute.value.matched[0]?.path).toBe('')
  })

  it('serves forbidden to anyone', async () => {
    const router = makeRouter()

    await router.push('/forbidden')

    expect(router.currentRoute.value.path).toBe('/forbidden')
  })

  it('sends an account that is signed in away from login', async () => {
    useAuthStore().user = ADMIN
    const router = makeRouter()

    await router.push('/auth/register')

    expect(router.currentRoute.value.path).toBe('/')
  })

  it('sends a visitor on verify-otp to login with next', async () => {
    const router = makeRouter()

    await router.push('/auth/verify-otp')

    expect(router.currentRoute.value.path).toBe('/auth/login')
    expect(router.currentRoute.value.query).toEqual({ next: '/auth/verify-otp' })
  })

  it('opens verify-otp to a signed-in account', async () => {
    useAuthStore().user = USER
    const router = makeRouter()

    await router.push('/auth/verify-otp')

    expect(router.currentRoute.value.path).toBe('/auth/verify-otp')
  })
})
