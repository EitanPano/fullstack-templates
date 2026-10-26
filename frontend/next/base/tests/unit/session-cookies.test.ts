import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearSessionCookies, setSessionCookies } from '@/shared/auth/cookies'
import { isAccessTokenExpired } from '@/shared/auth/token'
import { safeNextPath } from '@/shared/auth/next-path'

const jwt = (payload: object) =>
  `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`

afterEach(() => {
  vi.useRealTimers()
})

describe('setSessionCookies', () => {
  const tokens = {
    accessToken: 'a-token',
    accessExpiresAt: '2026-10-26T12:15:00.000Z',
    refreshToken: 'r-token',
    refreshExpiresAt: '2026-11-25T12:00:00.000Z',
  }

  it('sets both tokens HttpOnly, SameSite=Lax, on the whole site, with the API lifetimes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-26T12:00:00.000Z'))
    const set = vi.fn()

    setSessionCookies({ set, delete: vi.fn() }, tokens)

    expect(set).toHaveBeenCalledWith('access_token', 'a-token', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 15 * 60,
    })
    expect(set).toHaveBeenCalledWith('refresh_token', 'r-token', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 30 * 24 * 3600,
    })
  })

  it('never gives a negative or fractional lifetime', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-12-01T00:00:00.000Z'))
    const set = vi.fn()

    setSessionCookies({ set, delete: vi.fn() }, tokens)

    expect(set.mock.calls.map((call) => (call[2] as { maxAge: number }).maxAge)).toEqual([0, 0])
  })

  it('starts on an environment name of its own (staging) and leaves the cookies not Secure', async () => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'staging')
    const { setSessionCookies: setInStaging } = await import('@/shared/auth/cookies')
    const jarSet = vi.fn()

    setInStaging({ set: jarSet, delete: vi.fn() }, tokens)

    expect(jarSet).toHaveBeenCalledWith(
      'access_token',
      'a-token',
      expect.objectContaining({ secure: false }),
    )
    vi.unstubAllEnvs()
  })

  it('marks the cookies Secure in production', async () => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'production')
    const { setSessionCookies: setInProduction } = await import('@/shared/auth/cookies')
    const set = vi.fn()

    setInProduction({ set, delete: vi.fn() }, tokens)

    expect(set).toHaveBeenCalledWith(
      'access_token',
      'a-token',
      expect.objectContaining({ secure: true }),
    )
    vi.unstubAllEnvs()
  })
})

describe('clearSessionCookies', () => {
  it('deletes both cookies', () => {
    const remove = vi.fn()

    clearSessionCookies({ set: vi.fn(), delete: remove })

    expect(remove).toHaveBeenCalledWith('access_token')
    expect(remove).toHaveBeenCalledWith('refresh_token')
  })
})

describe('isAccessTokenExpired', () => {
  const now = Date.parse('2026-10-26T12:00:00Z')

  it('is false while exp is in the future', () => {
    expect(isAccessTokenExpired(jwt({ exp: now / 1000 + 600 }), now)).toBe(false)
  })

  it('is true once exp has passed, and within the skew before it', () => {
    expect(isAccessTokenExpired(jwt({ exp: now / 1000 - 1 }), now)).toBe(true)
    expect(isAccessTokenExpired(jwt({ exp: now / 1000 + 5 }), now)).toBe(true)
  })

  it('treats anything it cannot read as expired (it never grants, only asks for a refresh)', () => {
    expect(isAccessTokenExpired('not-a-jwt', now)).toBe(true)
    expect(isAccessTokenExpired('', now)).toBe(true)
    expect(isAccessTokenExpired(jwt({}), now)).toBe(true)
    expect(isAccessTokenExpired(jwt({ exp: 'soon' }), now)).toBe(true)
    expect(isAccessTokenExpired('a.%%%.c', now)).toBe(true)
  })
})

describe('safeNextPath', () => {
  it('keeps a path on this site, with its query', () => {
    expect(safeNextPath('/profile')).toBe('/profile')
    expect(safeNextPath('/profile?tab=a#top')).toBe('/profile?tab=a#top')
  })

  it.each([
    'https://evil.example/',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    'profile',
    '',
    '/%0d%0aSet-Cookie:x=1',
    '/\u0000',
  ])('falls back to the home page for %j', (value) => {
    expect(safeNextPath(value)).toBe('/')
  })

  it('falls back for anything that is not a string', () => {
    expect(safeNextPath(undefined)).toBe('/')
    expect(safeNextPath(['/a'])).toBe('/')
  })

  it('does not send a signed-in account back to the sign-in screens', () => {
    expect(safeNextPath('/sign-in?next=/x')).toBe('/')
    expect(safeNextPath('/sign-up')).toBe('/')
  })
})
