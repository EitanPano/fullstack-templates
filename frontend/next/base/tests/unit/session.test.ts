import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The Next request context is the boundary: cookies() is faked and redirect() throws a
// marker so the test sees where the helper sent the visitor. The API is a stubbed fetch.
let accessCookie: string | undefined
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers()),
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'access_token' && accessCookie !== undefined
          ? { name, value: accessCookie }
          : undefined,
    }),
}))
vi.mock('next/server', () => ({ connection: () => Promise.resolve() }))
class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`)
  }
}
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Redirected(to)
  },
}))

const { readSession, requireAccount, requireRole } = await import('@/shared/auth/session')

const user = (role: 'user' | 'admin' = 'user') => ({
  id: 'u1',
  email: 'a@b.co',
  phone: null,
  role,
  status: 'active',
  emailVerifiedAt: null,
  phoneVerifiedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
})
const apiError = (code: string, status: number) =>
  Response.json({ error: { code, message: 'x' }, requestId: 'r1' }, { status })

beforeEach(() => {
  accessCookie = 'tok-1'
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('readSession', () => {
  it('returns null without calling the API when there is no access cookie', async () => {
    accessCookie = undefined
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(readSession()).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('asks the API who the token belongs to, with the token as a bearer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(user('admin')))
    vi.stubGlobal('fetch', fetchMock)

    const session = await readSession()

    expect(session).toEqual({ user: user('admin'), accessToken: 'tok-1' })
    const request = fetchMock.mock.calls[0]?.[0] as Request
    expect(new URL(request.url).pathname).toBe('/api/user/me')
    expect(request.headers.get('authorization')).toBe('Bearer tok-1')
  })

  it('takes the role from the API, never from the token', async () => {
    // A token that claims admin in its payload; the API says the account is a user.
    accessCookie = `h.${Buffer.from(JSON.stringify({ role: 'admin' })).toString('base64url')}.s`
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(user('user'))))

    expect((await readSession())?.user.role).toBe('user')
  })

  it('returns null when the API refuses the token (expired, revoked, forged)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(apiError('unauthenticated', 401)))

    await expect(readSession()).resolves.toBeNull()
  })

  it('fails closed and logs when the API is unreachable or broken', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    await expect(readSession()).resolves.toBeNull()

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(apiError('internal', 500)))
    await expect(readSession()).resolves.toBeNull()
    expect(log).toHaveBeenCalled()
  })

  it('returns null for a 200 that is not a user, and logs that the API answered wrongly', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ nope: true })))

    await expect(readSession()).resolves.toBeNull()
    expect(log).toHaveBeenCalledWith('[session] could not read the account', { error: undefined })
  })
})

describe('requireAccount', () => {
  it('returns the session of a signed-in account', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(user())))

    await expect(requireAccount()).resolves.toMatchObject({ user: { email: 'a@b.co' } })
  })

  it('redirects to sign-in when there is no session', async () => {
    accessCookie = undefined

    await expect(requireAccount()).rejects.toMatchObject({ to: '/sign-in' })
  })

  it('carries the page to come back to as a next parameter', async () => {
    accessCookie = undefined

    await expect(requireAccount('/profile?tab=a')).rejects.toMatchObject({
      to: '/sign-in?next=%2Fprofile%3Ftab%3Da',
    })
  })
})

describe('requireRole', () => {
  it('returns the session of an account with the role', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(user('admin'))))

    await expect(requireRole('admin')).resolves.toMatchObject({ user: { role: 'admin' } })
  })

  it('sends an account with another role to the stable /forbidden page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(user('user'))))

    await expect(requireRole('admin')).rejects.toMatchObject({ to: '/forbidden' })
  })

  it('sends a visitor with no session to sign-in, remembering the page', async () => {
    accessCookie = undefined

    await expect(requireRole('admin', '/staff/report')).rejects.toMatchObject({
      to: '/sign-in?next=%2Fstaff%2Freport',
    })
  })
})
