// jwt.ts belongs: signing and verifying the two token kinds (HS256 over jose). Access and
// refresh tokens use separate secrets, so one never verifies as the other. It does not belong:
// session state (the store keeps the refresh token's hash and checks that; the jti only makes
// two tokens issued for one session distinct) or
// cookies (cookies.ts). verify* returns null for any invalid token; the caller decides on 401.
import { SignJWT, jwtVerify } from 'jose'
import { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } from '../../config/constants'
import { env } from '../../config/env'
import { UserRole } from '../../models/user/enum'
import { parseDuration } from '../utils/time'

export type AccessClaims = { sub: string; role: UserRole; sid: string }
export type RefreshClaims = { sub: string; sid: string; jti: string }
type Signed = { token: string; expiresAt: Date }

const encoder = new TextEncoder()
const ACCESS_KEY = encoder.encode(env.JWT_ACCESS_SECRET)
const REFRESH_KEY = encoder.encode(env.JWT_REFRESH_SECRET)
const ROLES: readonly string[] = Object.values(UserRole)

async function sign(claims: Record<string, string>, key: Uint8Array, ttl: string): Promise<Signed> {
  const issuedAt = Math.floor(Date.now() / 1000)
  const exp = issuedAt + Math.floor(parseDuration(ttl) / 1000)
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(issuedAt)
    .setExpirationTime(exp)
    .sign(key)
  return { token, expiresAt: new Date(exp * 1000) }
}

async function payloadOf(token: string, key: Uint8Array): Promise<Record<string, unknown> | null> {
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] })
    return payload
  } catch {
    return null
  }
}

export function signAccess(claims: AccessClaims): Promise<Signed> {
  return sign({ ...claims }, ACCESS_KEY, ACCESS_TOKEN_TTL)
}

export function signRefresh(claims: RefreshClaims): Promise<Signed> {
  return sign({ ...claims }, REFRESH_KEY, REFRESH_TOKEN_TTL)
}

export async function verifyAccess(token: string): Promise<AccessClaims | null> {
  const p = await payloadOf(token, ACCESS_KEY)
  if (p === null) return null
  const { sub, sid, role } = p
  if (typeof sub !== 'string' || typeof sid !== 'string' || typeof role !== 'string') return null
  if (!ROLES.includes(role)) return null
  return { sub, sid, role: role as UserRole }
}

export async function verifyRefresh(token: string): Promise<RefreshClaims | null> {
  const p = await payloadOf(token, REFRESH_KEY)
  if (p === null) return null
  const { sub, sid, jti } = p
  if (typeof sub !== 'string' || typeof sid !== 'string' || typeof jti !== 'string') return null
  return { sub, sid, jti }
}
