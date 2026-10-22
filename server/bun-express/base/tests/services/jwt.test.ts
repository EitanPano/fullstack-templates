import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'
import { SignJWT } from 'jose'
import { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } from '../../src/config/constants'
import { env } from '../../src/config/env'
import {
  signAccess,
  signRefresh,
  verifyAccess,
  verifyRefresh,
} from '../../src/services/security/jwt'
import { parseDuration } from '../../src/services/utils/time'

const access = { sub: 'user-1', role: 'user', sid: 'session-1' } as const
const refresh = { sub: 'user-1', sid: 'session-1', jti: 'jti-1' } as const

function signRaw(claims: Record<string, unknown>, secret: string) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 60)
    .sign(new TextEncoder().encode(secret))
}

afterEach(() => setSystemTime())

describe('access tokens', () => {
  test('round trip with the exact claims', async () => {
    const { token } = await signAccess(access)
    expect(await verifyAccess(token)).toEqual(access)
  })

  test('expiresAt is now plus the TTL', async () => {
    setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const { expiresAt } = await signAccess(access)
    const expected = Date.now() + parseDuration(ACCESS_TOKEN_TTL)
    expect(Math.floor(expiresAt.getTime() / 1000)).toBe(Math.floor(expected / 1000))
  })

  test('expired token is null', async () => {
    setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const { token } = await signAccess(access)
    setSystemTime(new Date(Date.now() + parseDuration(ACCESS_TOKEN_TTL) + 5000))
    expect(await verifyAccess(token)).toBeNull()
  })

  test('a role outside UserRole is null', async () => {
    const token = await signRaw({ sub: 'u', sid: 's', role: 'root' }, env.JWT_ACCESS_SECRET)
    expect(await verifyAccess(token)).toBeNull()
  })

  test('missing claims are null', async () => {
    const token = await signRaw({ sub: 'u', role: 'user' }, env.JWT_ACCESS_SECRET)
    expect(await verifyAccess(token)).toBeNull()
  })
})

describe('refresh tokens', () => {
  test('round trip with the exact claims', async () => {
    const { token } = await signRefresh(refresh)
    expect(await verifyRefresh(token)).toEqual(refresh)
  })

  test('expiresAt is now plus the TTL', async () => {
    setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const { expiresAt } = await signRefresh(refresh)
    const expected = Date.now() + parseDuration(REFRESH_TOKEN_TTL)
    expect(Math.floor(expiresAt.getTime() / 1000)).toBe(Math.floor(expected / 1000))
  })

  test('expired token is null', async () => {
    setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const { token } = await signRefresh(refresh)
    setSystemTime(new Date(Date.now() + parseDuration(REFRESH_TOKEN_TTL) + 5000))
    expect(await verifyRefresh(token)).toBeNull()
  })

  test('a non-string jti is null', async () => {
    const token = await signRaw({ sub: 'u', sid: 's', jti: 5 }, env.JWT_REFRESH_SECRET)
    expect(await verifyRefresh(token)).toBeNull()
  })
})

describe('isolation and garbage', () => {
  test('kinds do not verify as each other', async () => {
    const a = await signAccess(access)
    const r = await signRefresh(refresh)
    expect(await verifyRefresh(a.token)).toBeNull()
    expect(await verifyAccess(r.token)).toBeNull()
  })

  test('a token signed with another secret is null', async () => {
    const token = await signRaw({ ...access }, 'some-other-secret-that-is-long-enough-0123')
    expect(await verifyAccess(token)).toBeNull()
  })

  test('a token signed with HS512 using the access secret is null (alg pinning)', async () => {
    const token = await new SignJWT({ ...access })
      .setProtectedHeader({ alg: 'HS512' })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 60)
      .sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET))
    expect(await verifyAccess(token)).toBeNull()
  })

  test('garbage is null', async () => {
    expect(await verifyAccess('garbage')).toBeNull()
    expect(await verifyRefresh('')).toBeNull()
  })
})
