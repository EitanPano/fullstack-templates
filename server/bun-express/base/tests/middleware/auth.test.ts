import { afterEach, describe, expect, it, setSystemTime } from 'bun:test'
import cookieParser from 'cookie-parser'
import express from 'express'
import { SignJWT } from 'jose'
import request from 'supertest'

import { authenticate, requireAuth, requireCaller } from '../../src/middleware/auth'
import { errorHandler } from '../../src/middleware/error-handler'
import { env } from '../../src/config/env'
import { signAccess } from '../../src/services/security/jwt'
import { AppError } from '../../src/services/utils/error'

type Body = {
  caller: { id: string; role: string; sessionId: string } | null
  error: { code: string }
}

afterEach(() => setSystemTime())

function probe() {
  const app = express()
  app.use(cookieParser())
  app.get('/open', authenticate, (_req, res) => {
    res.json({ caller: res.locals.caller ?? null })
  })
  app.get('/me', requireAuth, (_req, res) => {
    res.json({ caller: requireCaller(res) })
  })
  app.use(errorHandler)
  return app
}

const token = async (sub: string, role: 'user' | 'admin' = 'user') =>
  (await signAccess({ sub, role, sid: `sid-${sub}` })).token

describe('authenticate and requireAuth', () => {
  it('leaves no caller and answers 401 on a protected route without a token', async () => {
    const res = await request(probe()).get('/me')

    expect(res.status).toBe(401)
    expect((res.body as Body).error.code).toBe('unauthenticated')
  })

  it('resolves the caller from a bearer token', async () => {
    const res = await request(probe())
      .get('/me')
      .set('Authorization', `Bearer ${await token('u1', 'admin')}`)

    expect(res.status).toBe(200)
    expect((res.body as Body).caller).toEqual({ id: 'u1', role: 'admin', sessionId: 'sid-u1' })
  })

  it('resolves the caller from the access cookie', async () => {
    const res = await request(probe())
      .get('/me')
      .set('Cookie', `access_token=${await token('u2')}`)

    expect((res.body as Body).caller).toEqual({ id: 'u2', role: 'user', sessionId: 'sid-u2' })
  })

  it('prefers the header over the cookie', async () => {
    const res = await request(probe())
      .get('/me')
      .set('Authorization', `Bearer ${await token('header')}`)
      .set('Cookie', `access_token=${await token('cookie')}`)

    expect((res.body as Body).caller?.id).toBe('header')
  })

  it('treats a garbage token as anonymous without rejecting in authenticate', async () => {
    const open = await request(probe()).get('/open').set('Authorization', 'Bearer garbage')
    const guarded = await request(probe()).get('/me').set('Authorization', 'Bearer garbage')

    expect(open.status).toBe(200)
    expect((open.body as Body).caller).toBeNull()
    expect(guarded.status).toBe(401)
  })

  it('treats an expired token as anonymous', async () => {
    const signed = await token('u3')
    setSystemTime(new Date(Date.now() + 60 * 60_000))

    const res = await request(probe()).get('/open').set('Authorization', `Bearer ${signed}`)

    expect(res.status).toBe(200)
    expect((res.body as Body).caller).toBeNull()
  })
})

describe('authenticate edge cases', () => {
  it('leaves the caller absent for an invalid bearer header even with a valid cookie', async () => {
    const res = await request(probe())
      .get('/open')
      .set('Authorization', 'Bearer garbage')
      .set('Cookie', `access_token=${await token('cookie')}`)

    expect(res.status).toBe(200)
    expect((res.body as Body).caller).toBeNull()
  })

  it('leaves the caller absent for a token with an unknown role claim', async () => {
    const forged = await new SignJWT({ role: 'superuser', sid: 's' })
      .setSubject('u9')
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 60)
      .sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET))

    const res = await request(probe()).get('/open').set('Authorization', `Bearer ${forged}`)

    expect((res.body as Body).caller).toBeNull()
  })
})

describe('requireCaller', () => {
  it('returns the caller when present and throws unauthenticated when absent', () => {
    const caller = { id: 'u', role: 'user', sessionId: 's' } as const

    expect(requireCaller({ locals: { caller } } as never)).toEqual(caller)
    expect(() => requireCaller({ locals: {} } as never)).toThrow(AppError)
  })
})
