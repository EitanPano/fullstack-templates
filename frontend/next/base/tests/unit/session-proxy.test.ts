import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { refreshSession } from '@/shared/auth/refresh'

// The proxy keeps the session alive: it refreshes an expired access token with the refresh token
// and rotates both cookies. The API is a stubbed fetch; the requests are real NextRequests.
const NOW = Date.parse('2026-10-26T12:00:00Z')
const jwt = (exp: number) => `h.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.sig`
const expired = jwt(NOW / 1000 - 60)
const fresh = jwt(NOW / 1000 + 600)

const session = (suffix: string) => ({
  user: { id: 'u1', email: 'a@b.co' },
  tokens: {
    accessToken: `new-access-${suffix}`,
    accessExpiresAt: new Date(NOW + 15 * 60_000).toISOString(),
    refreshToken: `new-refresh-${suffix}`,
    refreshExpiresAt: new Date(NOW + 30 * 24 * 3600_000).toISOString(),
  },
})

function requestWith(cookies: Record<string, string>) {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
  return new NextRequest('http://localhost:3000/profile', {
    headers: cookie ? { cookie } : {},
  })
}

function refreshBodies(fetchMock: ReturnType<typeof vi.fn>) {
  return Promise.all(
    fetchMock.mock.calls.map((call) => (call[0] as Request).clone().json() as Promise<unknown>),
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('refreshSession', () => {
  it('does nothing when the access token is still valid', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = await refreshSession(requestWith({ access_token: fresh, refresh_token: 'r1' }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(response.cookies.getAll()).toEqual([])
  })

  it('does nothing for a visitor with no refresh token', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await refreshSession(requestWith({}))
    await refreshSession(requestWith({ access_token: expired }))

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes an expired access token with the refresh token in the body and rotates both cookies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(session('1')))
    vi.stubGlobal('fetch', fetchMock)

    const response = await refreshSession(
      requestWith({ access_token: expired, refresh_token: 'old-refresh' }),
    )

    expect(await refreshBodies(fetchMock)).toEqual([{ refreshToken: 'old-refresh' }])
    const request = fetchMock.mock.calls[0]?.[0] as Request
    expect(new URL(request.url).pathname).toBe('/api/auth/refresh')
    expect(request.method).toBe('POST')
    expect(response.cookies.get('access_token')).toMatchObject({
      value: 'new-access-1',
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    })
    expect(response.cookies.get('refresh_token')).toMatchObject({ value: 'new-refresh-1' })
  })

  it('refreshes when the access cookie is missing (the browser dropped it at its max age)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(session('2')))
    vi.stubGlobal('fetch', fetchMock)

    const response = await refreshSession(requestWith({ refresh_token: 'old-refresh' }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(response.cookies.get('access_token')?.value).toBe('new-access-2')
  })

  it('hands the new tokens to the render of the same request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(session('3'))))

    const response = await refreshSession(
      requestWith({ access_token: expired, refresh_token: 'old-refresh' }),
    )

    const forwarded = response.headers.get('x-middleware-request-cookie') ?? ''
    expect(forwarded).toContain('access_token=new-access-3')
    expect(forwarded).toContain('refresh_token=new-refresh-3')
    expect(forwarded).not.toContain(expired)
  })

  it.each([400, 401, 403])('clears both cookies when the API refuses with %i', async (status) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { code: 'unauthenticated', message: 'x' }, requestId: 'r' },
            { status },
          ),
        ),
    )

    const response = await refreshSession(
      requestWith({ access_token: expired, refresh_token: 'revoked' }),
    )

    expect(response.cookies.get('access_token')).toMatchObject({ value: '', expires: new Date(0) })
    expect(response.cookies.get('refresh_token')).toMatchObject({ value: '', expires: new Date(0) })
    // The same request must not render as signed in with the dead tokens.
    const forwarded = response.headers.get('x-middleware-request-cookie') ?? ''
    expect(forwarded).not.toContain('revoked')
    expect(forwarded).not.toContain(expired)
  })

  it('keeps the cookies when the API cannot answer (an outage is not a sign-out)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const down = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    vi.stubGlobal('fetch', down)
    const first = await refreshSession(requestWith({ access_token: expired, refresh_token: 'r1' }))
    expect(first.cookies.getAll()).toEqual([])

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { code: 'rate_limited', message: 'x' }, requestId: 'r' },
            { status: 429 },
          ),
        ),
    )
    const second = await refreshSession(requestWith({ access_token: expired, refresh_token: 'r2' }))
    expect(second.cookies.getAll()).toEqual([])
  })

  it('refreshes once for two concurrent requests that carry the same refresh token', async () => {
    let release: (response: Response) => void = () => undefined
    const fetchMock = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        release = resolve
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const cookies = { access_token: expired, refresh_token: 'same-refresh' }

    const first = refreshSession(requestWith(cookies))
    const second = refreshSession(requestWith(cookies))
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
    release(Response.json(session('4')))
    const [a, b] = await Promise.all([first, second])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(a.cookies.get('access_token')?.value).toBe('new-access-4')
    expect(b.cookies.get('access_token')?.value).toBe('new-access-4')
  })

  it('refreshes again for a later request (the shared promise is dropped once settled)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(session('5')))
      .mockResolvedValueOnce(Response.json(session('6')))
    vi.stubGlobal('fetch', fetchMock)

    await refreshSession(requestWith({ access_token: expired, refresh_token: 'r' }))
    const later = await refreshSession(requestWith({ access_token: expired, refresh_token: 'r' }))

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(later.cookies.get('access_token')?.value).toBe('new-access-6')
  })
})
