import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The request context is the boundary: cookies() is a spy-backed jar, redirect() is Next's own
// (it throws a NEXT_REDIRECT error the action client re-throws). The API is a stubbed fetch.
const jar = new Map<string, string>()
const set = vi.fn((name: string, value: string) => void jar.set(name, value))
const remove = vi.fn((name: string) => void jar.delete(name))
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers()),
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
      set,
      delete: remove,
    }),
}))

const { signIn, signOut, signUp } = await import('@/feature/auth/server/action')

const tokens = {
  accessToken: 'access-1',
  accessExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  refreshToken: 'refresh-1',
  refreshExpiresAt: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
}
const authSession = { user: { id: 'u1', email: 'a@b.co' }, tokens }
const apiError = (code: string, status: number, details?: unknown) =>
  Response.json(
    { error: { code, message: 'server text: db password hunter2', details }, requestId: 'r1' },
    { status },
  )
const credentials = { email: 'a@b.co', password: 'correct horse' }

function lastRequest(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.at(-1)?.[0] as Request
}
async function redirectTarget(run: Promise<unknown>) {
  const error = await run.then(
    () => undefined,
    (e: unknown) => e,
  )
  const digest = (error as { digest?: string } | undefined)?.digest ?? ''
  return digest.startsWith('NEXT_REDIRECT') ? decodeURIComponent(digest.split(';')[2] ?? '') : null
}

beforeEach(() => {
  jar.clear()
  set.mockClear()
  remove.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('signIn', () => {
  it('calls the API, sets both cookies and sends the account to the home page', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(authSession, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const target = await redirectTarget(signIn(credentials))

    expect(target).toBe('/')
    expect(new URL(lastRequest(fetchMock).url).pathname).toBe('/api/auth/login')
    expect(await lastRequest(fetchMock).clone().json()).toEqual(credentials)
    expect(set).toHaveBeenCalledWith(
      'access_token',
      'access-1',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
    )
    expect(set).toHaveBeenCalledWith('refresh_token', 'refresh-1', expect.anything())
  })

  it('sends the account back to the page it came from, only when that is a path on this site', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(Response.json(authSession))),
    )

    expect(await redirectTarget(signIn({ ...credentials, next: '/profile' }))).toBe('/profile')
    expect(await redirectTarget(signIn({ ...credentials, next: 'https://evil.example' }))).toBe('/')
    expect(await redirectTarget(signIn({ ...credentials, next: '//evil.example' }))).toBe('/')
  })

  it('answers a wrong password (401) with our copy and sets no cookie', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(apiError('unauthenticated', 401)))

    const result = await signIn(credentials)

    expect(result.serverError).toBe('Email or password is wrong.')
    expect(JSON.stringify(result)).not.toContain('hunter2')
    expect(set).not.toHaveBeenCalled()
  })

  it('answers a blocked account (403) with our copy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(apiError('forbidden', 403)))

    expect((await signIn(credentials)).serverError).toBe(
      'This account is blocked. Contact support.',
    )
  })

  it('answers the rate limit (429) with our copy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(apiError('rate_limited', 429)))

    expect((await signIn(credentials)).serverError).toBe(
      'Too many sign-in attempts. Wait a few minutes and try again.',
    )
  })

  it('puts an API 400 on the fields it names, with no server text', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          apiError('validation_failed', 400, [{ path: 'email', message: 'Invalid hunter2' }]),
        ),
    )

    const result = await signIn(credentials)

    expect(result.validationErrors?.email?._errors).toHaveLength(1)
    expect(JSON.stringify(result)).not.toContain('hunter2')
  })

  it('rejects input the schema refuses before calling the API', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await signIn({ email: 'not-an-email', password: '' })

    expect(result.validationErrors?.email?._errors).toBeDefined()
    expect(result.validationErrors?.password?._errors).toBeDefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports an unreachable API without a cause', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED 10.0.0.5:4000')))

    const result = await signIn(credentials)

    expect(result.serverError).toBe("Can't reach the server. Check your connection and try again.")
    expect(JSON.stringify(result)).not.toContain('10.0.0.5')
  })
})

describe('signUp', () => {
  const input = { ...credentials, confirm: credentials.password }

  it('creates the account (201), sets both cookies and sends the account on', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(authSession, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    const target = await redirectTarget(signUp(input))

    expect(target).toBe('/')
    expect(new URL(lastRequest(fetchMock).url).pathname).toBe('/api/auth/register')
    // The confirmation field is a form concern: it never reaches the API.
    expect(await lastRequest(fetchMock).clone().json()).toEqual(credentials)
    expect(set).toHaveBeenCalledWith('access_token', 'access-1', expect.anything())
    expect(set).toHaveBeenCalledWith('refresh_token', 'refresh-1', expect.anything())
  })

  it('shows a taken email (409) on the email field, not as a toast', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(apiError('conflict', 409)))

    const result = await signUp(input)

    expect(result.validationErrors).toEqual({
      email: { _errors: ['That email is already registered. Sign in instead.'] },
    })
    expect(result.serverError).toBeUndefined()
    expect(set).not.toHaveBeenCalled()
  })

  it('refuses a confirmation that differs, before calling the API', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await signUp({ ...input, confirm: 'something else' })

    expect(result.validationErrors?.confirm?._errors).toBeDefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers the rate limit (429) with our copy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(apiError('rate_limited', 429)))

    expect((await signUp(input)).serverError).toBe(
      'Too many sign-up attempts. Wait a few minutes and try again.',
    )
  })

  it('answers a server fault (500) with the generic copy and logs the request id', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(apiError('internal', 500)))

    expect((await signUp(input)).serverError).toBe('Something went wrong on our side. Try again.')
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('[api]'),
      expect.objectContaining({ requestId: 'r1' }),
    )
  })
})

describe('signOut', () => {
  it('revokes the session with the access token, clears both cookies and goes to sign-in', async () => {
    jar.set('access_token', 'access-1')
    jar.set('refresh_token', 'refresh-1')
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    const target = await redirectTarget(signOut())

    expect(target).toBe('/sign-in')
    const request = lastRequest(fetchMock)
    expect(new URL(request.url).pathname).toBe('/api/auth/logout')
    expect(request.headers.get('authorization')).toBe('Bearer access-1')
    expect(remove).toHaveBeenCalledWith('access_token')
    expect(remove).toHaveBeenCalledWith('refresh_token')
  })

  it('clears the cookies even when the API cannot be reached, and logs it', async () => {
    jar.set('access_token', 'access-1')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    const target = await redirectTarget(signOut())

    expect(target).toBe('/sign-in')
    expect(remove).toHaveBeenCalledWith('access_token')
    expect(remove).toHaveBeenCalledWith('refresh_token')
    expect(console.error).toHaveBeenCalled()
  })

  it('refreshes first when only the refresh cookie is left, then revokes the new session', async () => {
    jar.set('refresh_token', 'refresh-old')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(authSession))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    const target = await redirectTarget(signOut())

    expect(target).toBe('/sign-in')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(new URL((fetchMock.mock.calls[0]?.[0] as Request).url).pathname).toBe(
      '/api/auth/refresh',
    )
    const logout = fetchMock.mock.calls[1]?.[0] as Request
    expect(new URL(logout.url).pathname).toBe('/api/auth/logout')
    expect(logout.headers.get('authorization')).toBe('Bearer access-1')
    expect(remove).toHaveBeenCalledWith('refresh_token')
  })

  it('still clears the cookies when the refresh before sign-out is refused', async () => {
    jar.set('refresh_token', 'refresh-dead')
    const fetchMock = vi.fn().mockResolvedValue(apiError('unauthenticated', 401))
    vi.stubGlobal('fetch', fetchMock)

    const target = await redirectTarget(signOut())

    expect(target).toBe('/sign-in')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith('refresh_token')
  })

  it('does not call the API when there is no token at all, and still clears and redirects', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const target = await redirectTarget(signOut())

    expect(target).toBe('/sign-in')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(remove).toHaveBeenCalledWith('refresh_token')
  })
})
