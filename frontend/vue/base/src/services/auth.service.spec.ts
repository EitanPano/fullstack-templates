import { createPinia, setActivePinia } from 'pinia'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { installInterceptors } from '@/core/interceptors/http.provider'
import { envelope, SESSION, USER } from '@/testing/auth-fixtures'
import { stubApi } from '@/testing/stub-api'

import { authService } from './auth.service'

async function bodyOf(request: unknown): Promise<unknown> {
  return (await (request as Request).clone().json()) as unknown
}

describe('authService', () => {
  beforeAll(() => {
    installInterceptors()
  })

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('signs in with the credentials and returns the session', async () => {
    const fetchMock = stubApi({ 'POST /api/auth/login': Response.json(SESSION) })

    const session = await authService.login({ email: USER.email, password: 'a-long-password' })

    expect(session.user).toEqual(USER)
    expect(await bodyOf(fetchMock.mock.calls[0]?.[0])).toEqual({
      email: USER.email,
      password: 'a-long-password',
    })
  })

  it('signs up with the credentials', async () => {
    stubApi({ 'POST /api/auth/register': Response.json(SESSION, { status: 201 }) })

    const session = await authService.register({ email: USER.email, password: 'a-long-password' })

    expect(session.user.email).toBe(USER.email)
  })

  it('refreshes with an empty body: the refresh token travels in its cookie', async () => {
    const fetchMock = stubApi({ 'POST /api/auth/refresh': Response.json(SESSION) })

    await authService.refresh()

    expect(await bodyOf(fetchMock.mock.calls[0]?.[0])).toEqual({})
  })

  it('signs out with an empty body', async () => {
    const fetchMock = stubApi({ 'POST /api/auth/logout': new Response(null, { status: 204 }) })

    await expect(authService.logout()).resolves.toBeUndefined()

    expect(await bodyOf(fetchMock.mock.calls[0]?.[0])).toEqual({})
  })

  it('asks for a code and verifies it', async () => {
    stubApi({
      'POST /api/auth/otp': Response.json({}, { status: 202 }),
      'POST /api/auth/otp/verification': Response.json({ user: USER }),
    })
    const target = { type: 'email', value: USER.email } as const

    await expect(authService.requestOtp({ target, purpose: 'verify' })).resolves.toBeUndefined()
    const verified = await authService.verifyOtp({ target, purpose: 'verify', code: '123456' })

    expect(verified.user).toEqual(USER)
  })

  it('rejects with the ApiError when the API refuses', async () => {
    stubApi({ 'POST /api/auth/login': envelope('unauthenticated', 401) })

    await expect(authService.login({ email: 'a@b.co', password: 'x' })).rejects.toMatchObject({
      code: 'unauthenticated',
      status: 401,
    })
  })
})
