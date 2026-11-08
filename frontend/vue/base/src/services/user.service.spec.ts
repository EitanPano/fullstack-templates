import { createPinia, setActivePinia } from 'pinia'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { installInterceptors } from '@/core/interceptors/http.provider'
import { envelope, USER } from '@/testing/auth-fixtures'
import { stubApi } from '@/testing/stub-api'

import { userService } from './user.service'

describe('userService', () => {
  beforeAll(() => {
    installInterceptors()
  })

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('reads the signed-in account', async () => {
    stubApi({ 'GET /api/user/me': Response.json(USER) })

    expect(await userService.me()).toEqual(USER)
  })

  it('changes the phone number and returns the account', async () => {
    const fetchMock = stubApi({
      'PATCH /api/user/me': Response.json({ ...USER, phone: '+14155550132' }),
    })

    const user = await userService.update({ phone: '+14155550132' })

    expect(user.phone).toBe('+14155550132')
    const request = fetchMock.mock.calls[0]?.[0] as unknown as Request
    expect(await request.clone().json()).toEqual({ phone: '+14155550132' })
  })

  it('rejects with the ApiError when the API refuses', async () => {
    stubApi({ 'GET /api/user/me': envelope('internal', 500) })

    await expect(userService.me()).rejects.toMatchObject({ code: 'internal', status: 500 })
  })
})
