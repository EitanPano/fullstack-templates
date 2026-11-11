import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The request context is the boundary: headers() is faked, the API is a stubbed fetch.
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }))

const { getMe } = await import('@/services/user')

let fetchMock: ReturnType<typeof vi.fn>
const sent = () => fetchMock.mock.calls[0]?.[0] as Request

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getMe', () => {
  it('reads the account with the access token as a bearer', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'u1', email: 'a@b.co', role: 'user' }))

    const result = await getMe('tok')

    expect(new URL(sent().url).pathname).toBe('/api/user/me')
    expect(sent().headers.get('authorization')).toBe('Bearer tok')
    expect(result.data).toMatchObject({ id: 'u1' })
  })

  it('resolves with the error envelope on a 401, without throwing', async () => {
    const envelope = { error: { code: 'unauthenticated', message: 'no' } }
    fetchMock.mockResolvedValue(Response.json(envelope, { status: 401 }))

    const result = await getMe('stale')

    expect(result.response?.status).toBe(401)
    expect(result.error).toEqual(envelope)
  })
})

describe('getProfile', () => {
  it('returns the account from one request to /api/user/me', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'u1', email: 'a@b.co', role: 'user' }))
    const { getProfile } = await import('@/services/user')

    const account = await getProfile('tok')
    expect(account).toMatchObject({ id: 'u1' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(new URL(sent().url).pathname).toBe('/api/user/me')
  })

  it('throws an ActionError when the API answers 401', async () => {
    const envelope = { error: { code: 'unauthenticated', message: 'no' } }
    fetchMock.mockResolvedValue(Response.json(envelope, { status: 401 }))
    const { getProfile } = await import('@/services/user')
    const { ActionError } = await import('@/core/actions/action-error')

    await expect(getProfile('stale')).rejects.toBeInstanceOf(ActionError)
  })
})
