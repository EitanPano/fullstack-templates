import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getApiHealth,
  postApiAuthLogin,
  postApiAuthLogout,
  postApiAuthOtp,
  postApiAuthOtpVerification,
  postApiAuthRefresh,
  postApiAuthRegister,
} from '@/shared/api/generated'
import { clearSessionHint, hasSessionHint, setSessionHint } from '@/shared/api/session-hint'

// A 401 becomes one refresh and one retry for a browser that signed in (the session hint).
const unauthorized = () =>
  Response.json(
    { error: { code: 'unauthenticated', message: 'x' }, requestId: 'r' },
    { status: 401 },
  )
const ok = () => Response.json({ status: 'ok', version: '1', uptimeSeconds: 1 })

const pathOf = (call: unknown[]) => new URL((call[0] as Request).url).pathname

beforeEach(() => {
  setSessionHint()
})

afterEach(() => {
  vi.unstubAllGlobals()
  clearSessionHint()
})

describe('the 401 refresh', () => {
  it('refreshes once on a 401 and retries the request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(Response.json({}, { status: 200 }))
      .mockResolvedValueOnce(ok())
    vi.stubGlobal('fetch', fetchMock)

    const { data } = await getApiHealth()

    expect(data).toMatchObject({ status: 'ok' })
    expect(fetchMock.mock.calls.map(pathOf)).toEqual([
      '/api/health',
      '/api/auth/refresh',
      '/api/health',
    ])
    expect(((fetchMock.mock.calls[1] as unknown[])[0] as Request).method).toBe('POST')
  })

  it('collapses concurrent 401s into one refresh', async () => {
    let refreshes = 0
    let attempts = 0
    vi.stubGlobal('fetch', (input: Request) => {
      if (new URL(input.url).pathname === '/api/auth/refresh') {
        refreshes += 1
        // Slow enough that all three 401s have arrived before the refresh settles.
        return new Promise<Response>((resolve) =>
          setTimeout(() => {
            resolve(Response.json({}))
          }, 20),
        )
      }
      // The first three attempts are the three requests; everything after is a retry.
      attempts += 1
      return Promise.resolve(attempts <= 3 ? unauthorized() : ok())
    })

    const results = await Promise.all([getApiHealth(), getApiHealth(), getApiHealth()])

    expect(refreshes).toBe(1)
    for (const result of results) expect(result.response?.status).toBe(200)
  })

  it('returns the 401 when the refresh is refused', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(Response.json({}, { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    const { response } = await getApiHealth()

    expect(response?.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns the 401 when the refresh cannot reach the API', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthorized())
      .mockRejectedValueOnce(new TypeError('fetch failed'))
    vi.stubGlobal('fetch', fetchMock)

    const { response } = await getApiHealth()

    expect(response?.status).toBe(401)
  })

  it('does not refresh for a browser that never signed in', async () => {
    clearSessionHint()
    const fetchMock = vi.fn().mockResolvedValue(unauthorized())
    vi.stubGlobal('fetch', fetchMock)

    const { response } = await getApiHealth()

    expect(response?.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['sign-in', () => postApiAuthLogin({ body: { email: 'a@b.co', password: 'password1' } })],
    ['sign-up', () => postApiAuthRegister({ body: { email: 'a@b.co', password: 'password1' } })],
    ['the refresh itself', () => postApiAuthRefresh({ body: {} })],
    [
      'an OTP request',
      () => postApiAuthOtp({ body: { channel: 'email', identifier: 'a@b.co' } as never }),
    ],
    [
      'an OTP verification',
      () => postApiAuthOtpVerification({ body: { identifier: 'a@b.co', code: '123456' } as never }),
    ],
  ])('never refreshes after a 401 from %s', async (_name, send) => {
    const fetchMock = vi.fn().mockResolvedValue(unauthorized())
    vi.stubGlobal('fetch', fetchMock)

    const { response } = await send()

    expect(response?.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refreshes for sign-out, which needs a live session to revoke', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await postApiAuthLogout({ body: {} })

    expect(fetchMock.mock.calls.map(pathOf)).toEqual([
      '/api/auth/logout',
      '/api/auth/refresh',
      '/api/auth/logout',
    ])
  })

  it.each([400, 401, 403])('forgets the hint when the refresh answers %i', async (status) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(Response.json({}, { status }))
      .mockResolvedValue(unauthorized())
    vi.stubGlobal('fetch', fetchMock)

    await getApiHealth()
    expect(hasSessionHint()).toBe(false)

    // The next 401 costs no refresh call at all.
    fetchMock.mockClear()
    await getApiHealth()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['429', () => Promise.resolve(Response.json({}, { status: 429 }))],
    ['503', () => Promise.resolve(Response.json({}, { status: 503 }))],
    ['a network error', () => Promise.reject(new TypeError('fetch failed'))],
  ])('keeps the hint when the refresh fails with %s', async (_name, refresh) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(unauthorized()).mockImplementationOnce(refresh)
    vi.stubGlobal('fetch', fetchMock)

    await getApiHealth()

    expect(hasSessionHint()).toBe(true)
  })
})
