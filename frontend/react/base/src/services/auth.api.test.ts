import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearSessionHint, hasSessionHint, setSessionHint } from '@/core/auth/session-hint'
import { withCopy } from '@/models/api-error'
import { api } from '@/services/api'
import { authApi } from '@/services/auth.api'
import { userApi } from '@/services/user.api'
import { createStore } from '@/store'
import { SESSION, USER, envelope } from '@/testing/auth-fixtures'
import { stubApi } from '@/testing/stub-api'

const CREDENTIALS = { email: 'ada@example.com', password: 'correct horse' }

beforeEach(() => {
  clearSessionHint()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  clearSessionHint()
})

const cachedAccount = (store: ReturnType<typeof createStore>) =>
  userApi.endpoints.getMe.select()(store.getState())

describe('login and register', () => {
  it.each([
    ['login', 'POST /api/auth/login', authApi.endpoints.login],
    ['register', 'POST /api/auth/register', authApi.endpoints.register],
  ])(
    '%s sets the hint and fills the getMe cache without a request',
    async (_n, route, endpoint) => {
      const fetchMock = stubApi({ [route]: Response.json(SESSION) })
      const store = createStore()

      const user = await store.dispatch(endpoint.initiate(CREDENTIALS)).unwrap()

      expect(user).toEqual(USER)
      expect(hasSessionHint()).toBe(true)
      // The cache write follows the mutation settling by a microtask or two.
      await vi.waitFor(() => {
        expect(cachedAccount(store).data).toEqual(USER)
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
  )

  it('never puts the tokens in the store', async () => {
    stubApi({ 'POST /api/auth/login': Response.json(SESSION) })
    const store = createStore()

    await store.dispatch(authApi.endpoints.login.initiate(CREDENTIALS)).unwrap()

    expect(JSON.stringify(store.getState())).not.toContain(SESSION.tokens.refreshToken)
  })

  it('a refused login leaves the hint and the cache alone', async () => {
    stubApi({ 'POST /api/auth/login': () => envelope('unauthenticated', 401) })
    const store = createStore()

    const error = await store
      .dispatch(authApi.endpoints.login.initiate(CREDENTIALS))
      .unwrap()
      .catch((cause: unknown) => cause)

    expect(error).toMatchObject({ code: 'unauthenticated' })
    expect(hasSessionHint()).toBe(false)
    expect(cachedAccount(store).status).toBe('uninitialized')
  })

  it('a taken email is a conflict the form words and puts on the email field', async () => {
    stubApi({ 'POST /api/auth/register': () => envelope('conflict', 409) })
    const store = createStore()

    const error: unknown = await store
      .dispatch(authApi.endpoints.register.initiate(CREDENTIALS))
      .unwrap()
      .catch((cause: unknown) => cause)

    expect(error).toMatchObject({ code: 'conflict' })
    expect(
      withCopy(
        error as never,
        { conflict: 'That email is already registered. Sign in instead.' },
        { conflict: 'email' },
      ).fieldErrors,
    ).toEqual({ email: 'That email is already registered. Sign in instead.' })
  })
})

describe('logout', () => {
  async function signedInStore() {
    setSessionHint()
    const store = createStore()
    await store.dispatch(userApi.util.upsertQueryData('getMe', undefined, USER))
    expect(cachedAccount(store).data).toEqual(USER)
    return store
  }

  it('revokes the session, clears the hint and resets the API state', async () => {
    const fetchMock = stubApi({ 'POST /api/auth/logout': new Response(null, { status: 204 }) })
    const store = await signedInStore()

    await store.dispatch(authApi.endpoints.logout.initiate()).unwrap()

    expect((fetchMock.mock.calls[0]?.[0] as Request).url).toContain('/api/auth/logout')
    expect(hasSessionHint()).toBe(false)
    expect(cachedAccount(store).status).toBe('uninitialized')
    expect(Object.keys(store.getState()[api.reducerPath].queries)).toHaveLength(0)
  })

  it('still clears everything, and resolves, when the API refuses to revoke', async () => {
    stubApi({ 'POST /api/auth/logout': () => envelope('internal', 500) })
    const store = await signedInStore()

    await store.dispatch(authApi.endpoints.logout.initiate()).unwrap()

    expect(console.error).toHaveBeenCalledWith(
      '[auth] sign-out could not revoke the session',
      expect.anything(),
    )
    expect(hasSessionHint()).toBe(false)
    expect(cachedAccount(store).status).toBe('uninitialized')
  })
})
