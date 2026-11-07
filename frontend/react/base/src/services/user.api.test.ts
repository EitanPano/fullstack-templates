import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isApiError } from '@/models/api-error'
import { userApi } from '@/services/user.api'
import { createStore } from '@/store'
import { USER, envelope } from '@/testing/auth-fixtures'
import { stubApi } from '@/testing/stub-api'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('user.api', () => {
  it('resolves getMe to the account and provides the User tag', async () => {
    stubApi({ 'GET /api/user/me': Response.json(USER) })
    const store = createStore()

    const result = await store.dispatch(userApi.endpoints.getMe.initiate())

    expect(result.data).toMatchObject({ email: USER.email })
    expect(userApi.util.selectInvalidatedBy(store.getState(), ['User'])).toHaveLength(1)
  })

  it('caches a 401 as "no account": data null, no error', async () => {
    stubApi({ 'GET /api/user/me': () => envelope('unauthenticated', 401) })
    const store = createStore()

    const result = await store.dispatch(userApi.endpoints.getMe.initiate())

    expect(result.isError).toBe(false)
    expect(result.data).toBeNull()
  })

  it('keeps any other failure an ApiError', async () => {
    stubApi({ 'GET /api/user/me': () => envelope('internal', 500) })
    const store = createStore()

    const result = await store.dispatch(userApi.endpoints.getMe.initiate())

    expect(result.isError).toBe(true)
    expect(isApiError(result.error)).toBe(true)
    expect(result.error).toMatchObject({ code: 'internal', status: 500 })
  })
})
