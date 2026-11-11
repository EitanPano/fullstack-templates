import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The request context is the boundary: headers() is faked, the API is a stubbed fetch.
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }))

const { login, logout, refresh, signup } = await import('@/services/auth')

const credentials = { email: 'a@b.co', password: 'correct horse' }
const tokens = { accessToken: 'a', refreshToken: 'r' }
let fetchMock: ReturnType<typeof vi.fn>
const sent = () => fetchMock.mock.calls[0]?.[0] as Request

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('login and signup', () => {
  it('post the credentials and resolve with the data', async () => {
    fetchMock.mockResolvedValue(Response.json({ tokens }))

    const result = await login(credentials)

    expect(sent().method).toBe('POST')
    expect(new URL(sent().url).pathname).toBe('/api/auth/login')
    expect(await sent().json()).toEqual(credentials)
    expect(result.data).toEqual({ tokens })

    fetchMock.mockClear()
    fetchMock.mockResolvedValue(Response.json({ tokens }))
    await signup(credentials)
    expect(new URL(sent().url).pathname).toBe('/api/auth/register')
  })

  it('resolve with the error envelope on a 401, without throwing', async () => {
    const envelope = { error: { code: 'unauthenticated', message: 'no' } }
    fetchMock.mockResolvedValue(Response.json(envelope, { status: 401 }))

    const result = await login(credentials)

    expect(result.response?.status).toBe(401)
    expect(result.error).toEqual(envelope)
    expect(result.data).toBeUndefined()
  })
})

describe('logout', () => {
  it('sends the access token as a bearer', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    await logout('tok')

    expect(new URL(sent().url).pathname).toBe('/api/auth/logout')
    expect(sent().headers.get('authorization')).toBe('Bearer tok')
  })
})

describe('refresh', () => {
  it('posts the refresh token and resolves with the data', async () => {
    fetchMock.mockResolvedValue(Response.json({ tokens }))

    const result = await refresh('old')

    expect(new URL(sent().url).pathname).toBe('/api/auth/refresh')
    expect(await sent().json()).toEqual({ refreshToken: 'old' })
    expect(result.data).toEqual({ tokens })
  })

  it('forwards the visitor address through the client headers', async () => {
    vi.resetModules()
    vi.stubEnv('CLIENT_IP_HEADER', 'x-forwarded-for')
    const fresh = await import('@/services/auth')
    fetchMock.mockResolvedValue(Response.json({ tokens }))

    await fresh.refresh('old', new Headers({ 'x-forwarded-for': '203.0.113.9' }))

    expect(sent().headers.get('x-forwarded-for')).toBe('203.0.113.9')
    vi.unstubAllEnvs()
  })
})
