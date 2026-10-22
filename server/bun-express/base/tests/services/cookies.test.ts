import { describe, expect, test } from 'bun:test'
import type { Request } from 'express'
import express from 'express'
import request from 'supertest'
import {
  clearAuthCookies,
  readAccessToken,
  readRefreshToken,
  setAuthCookies,
} from '../../src/services/security/cookies'

const tokens = {
  accessToken: 'access-value',
  accessExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  refreshToken: 'refresh-value',
  refreshExpiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
}

const app = express()
app.get('/issue', (_req, res) => {
  setAuthCookies(res, tokens)
  res.end()
})
app.get('/clear', (_req, res) => {
  clearAuthCookies(res)
  res.end()
})

function cookieLine(header: unknown, name: string): string {
  const line = (header as string[]).find((l) => l.startsWith(`${name}=`))
  if (line === undefined) throw new Error(`no ${name} cookie`)
  return line
}

describe('setAuthCookies', () => {
  test('sets both cookies with the security attributes', async () => {
    const res = await request(app).get('/issue')
    const access = cookieLine(res.headers['set-cookie'], 'access_token')
    const refresh = cookieLine(res.headers['set-cookie'], 'refresh_token')
    expect(access).toContain('access_token=access-value')
    expect(access).toContain('Path=/;')
    expect(refresh).toContain('Path=/api/auth')
    for (const line of [access, refresh]) {
      expect(line).toContain('HttpOnly')
      expect(line).toContain('SameSite=Lax')
      expect(line).toContain('Secure')
      expect(line).not.toContain('Domain=')
      expect(Number(/Max-Age=(\d+)/.exec(line)?.[1])).toBeGreaterThan(0)
    }
  })
})

describe('clearAuthCookies', () => {
  test('expires both cookies with matching attributes', async () => {
    const res = await request(app).get('/clear')
    const access = cookieLine(res.headers['set-cookie'], 'access_token')
    const refresh = cookieLine(res.headers['set-cookie'], 'refresh_token')
    expect(access).toContain('Path=/;')
    expect(refresh).toContain('Path=/api/auth')
    for (const line of [access, refresh]) {
      expect(line).toContain('HttpOnly')
      expect(line).toContain('SameSite=Lax')
      expect(line).toContain('Secure')
      expect(line).toContain('Expires=Thu, 01 Jan 1970')
    }
  })
})

const fakeReq = (parts: { headers?: object; cookies?: object; body?: unknown }): Request =>
  ({ headers: {}, cookies: {}, ...parts }) as unknown as Request

describe('readAccessToken', () => {
  test('header only', () => {
    expect(readAccessToken(fakeReq({ headers: { authorization: 'Bearer abc ' } }))).toBe('abc')
  })
  test('cookie only', () => {
    expect(readAccessToken(fakeReq({ cookies: { access_token: 'cook' } }))).toBe('cook')
  })
  test('header wins over cookie', () => {
    const req = fakeReq({ headers: { authorization: 'Bearer h' }, cookies: { access_token: 'c' } })
    expect(readAccessToken(req)).toBe('h')
  })
  test('empty bearer token is undefined', () => {
    expect(readAccessToken(fakeReq({ headers: { authorization: 'Bearer   ' } }))).toBeUndefined()
  })
  test('wrong-case prefix is ignored', () => {
    expect(readAccessToken(fakeReq({ headers: { authorization: 'bearer abc' } }))).toBeUndefined()
  })
  test('neither is undefined', () => {
    expect(readAccessToken(fakeReq({}))).toBeUndefined()
  })
})

describe('readRefreshToken', () => {
  test('cookie', () => {
    expect(readRefreshToken(fakeReq({ cookies: { refresh_token: 'r' } }))).toBe('r')
  })
  test('body', () => {
    expect(readRefreshToken(fakeReq({ body: { refreshToken: 'b' } }))).toBe('b')
  })
  test('cookie wins over body', () => {
    const req = fakeReq({ cookies: { refresh_token: 'r' }, body: { refreshToken: 'b' } })
    expect(readRefreshToken(req)).toBe('r')
  })
  test('neither is undefined', () => {
    expect(readRefreshToken(fakeReq({}))).toBeUndefined()
  })
  test('non-string or empty body field is undefined', () => {
    expect(readRefreshToken(fakeReq({ body: { refreshToken: 5 } }))).toBeUndefined()
    expect(readRefreshToken(fakeReq({ body: { refreshToken: '' } }))).toBeUndefined()
  })
})
