import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  setSystemTime,
} from 'bun:test'
import request from 'supertest'

import * as userRepository from '../src/api/user/repository'
import { memory } from '../src/infra/memory'
import { pubsub } from '../src/infra/pubsub'
import type { AuthTokens } from '../src/models/auth/type'
import type { PublicUser } from '../src/models/user/type'
import { app } from '../src/server'
import { type Message, registerProvider, resetProviders } from '../src/services/communicate'
import { createConsoleProvider } from '../src/services/communicate/console'
import { getDb } from '../src/services/db'
import { drain } from '../src/services/event'
import { createLogger } from '../src/services/logger'

const PASSWORD = 'correct horse battery'

type Body = {
  user: PublicUser
  tokens: AuthTokens
  email: string
  error: { code: string; message: string; details: { path: string }[] }
}
const body = (res: request.Response) => res.body as Body
let sent: Message[] = []

beforeAll(async () => {
  await pubsub.connect()
})

afterAll(async () => {
  await pubsub.close()
})

beforeEach(async () => {
  await memory.close()
  sent = []
  const capture = {
    send(message: Message) {
      sent.push(message)
      return Promise.resolve()
    },
  }
  registerProvider('mail', capture)
  registerProvider('sms', capture)
})

afterEach(() => {
  setSystemTime()
  resetProviders()
})

const register = (email: string, password = PASSWORD) =>
  request(app).post('/api/auth/register').send({ email, password })
const login = (email: string, password = PASSWORD) =>
  request(app).post('/api/auth/login').send({ email, password })

function cookiesOf(res: request.Response): string[] {
  const header: unknown = res.headers['set-cookie']
  return Array.isArray(header) ? header.map(String) : []
}

function cookieLine(res: request.Response, name: string): string {
  return cookiesOf(res).find((cookie) => cookie.startsWith(`${name}=`)) ?? ''
}

function tokenFromCookie(res: request.Response, name: string): string {
  return (
    cookieLine(res, name)
      .split(';')[0]
      ?.slice(name.length + 1) ?? ''
  )
}

const refreshWith = (token: string) =>
  request(app).post('/api/auth/refresh').set('Cookie', `refresh_token=${token}`)

// Login-OTP delivery is detached from the request; one macrotask lets it finish (no sleep).
const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

const codeOf = (message: Message | undefined) => /\d{6}/.exec(message?.template.text ?? '')?.[0]

async function signedIn(email: string) {
  const res = await register(email)
  return { res, bearer: `Bearer ${body(res).tokens.accessToken}` }
}

async function verifyContact(id: string, type: 'email' | 'phone') {
  const record = await userRepository.findById(id)
  if (record === undefined) throw new Error('user missing')
  const now = new Date()
  await userRepository.update(
    type === 'email' ? { ...record, emailVerifiedAt: now } : { ...record, phoneVerifiedAt: now },
  )
}

async function block(id: string) {
  const record = await userRepository.findById(id)
  if (record === undefined) throw new Error('user missing')
  await userRepository.update({ ...record, status: 'blocked' })
}

describe('register', () => {
  it('answers 201 with tokens, two httpOnly cookies and no passwordHash', async () => {
    const res = await register('ada@example.com')

    expect(res.status).toBe(201)
    expect(body(res).user.email).toBe('ada@example.com')
    expect(body(res).user).not.toHaveProperty('passwordHash')
    expect(Object.keys(body(res).tokens).sort()).toEqual([
      'accessExpiresAt',
      'accessToken',
      'refreshExpiresAt',
      'refreshToken',
    ])
    expect(cookieLine(res, 'access_token')).toContain('Path=/;')
    expect(cookieLine(res, 'access_token')).toContain('HttpOnly')
    expect(cookieLine(res, 'refresh_token')).toContain('Path=/api/auth')
    expect(cookieLine(res, 'refresh_token')).toContain('HttpOnly')
  })

  it('answers 409 for a duplicate email', async () => {
    await register('ada@example.com')
    const res = await register('ADA@example.com')

    expect(res.status).toBe(409)
    expect(body(res).error.code).toBe('conflict')
  })

  it('answers 400 for a short password with details', async () => {
    const res = await register('ada@example.com', 'short')

    expect(res.status).toBe(400)
    expect(body(res).error.code).toBe('validation_failed')
    expect(body(res).error.details[0]?.path).toBe('password')
  })

  it('delivers the welcome template through user.registered', async () => {
    await register('ada@example.com')
    await drain()

    const welcome = sent.find((message) => message.template.name === 'welcome')
    expect(welcome?.to).toBe('ada@example.com')
  })
})

describe('login', () => {
  it('answers 200 with tokens', async () => {
    await register('ada@example.com')
    const res = await login('Ada@example.com')

    expect(res.status).toBe(200)
    expect(body(res).tokens.accessToken).toBeString()
    expect(tokenFromCookie(res, 'refresh_token')).toBe(body(res).tokens.refreshToken)
  })

  it('answers the same 401 for an unknown email and a wrong password', async () => {
    await register('ada@example.com')
    const unknown = await login('nobody@example.com')
    const wrong = await login('ada@example.com', 'not the password')

    expect(unknown.status).toBe(401)
    expect(wrong.status).toBe(401)
    expect(body(unknown).error.code).toBe(body(wrong).error.code)
    expect(body(unknown).error.message).toBe(body(wrong).error.message)
  })

  it('answers 403 for a blocked account', async () => {
    const { res } = await signedIn('ada@example.com')
    await block(body(res).user.id)

    expect((await login('ada@example.com')).status).toBe(403)
  })

  it('is limited per email', async () => {
    await register('ada@example.com')
    for (let i = 0; i < 5; i++) {
      expect((await login('ada@example.com', 'wrong password')).status).toBe(401)
    }
    const limited = await login('ada@example.com', 'wrong password')

    expect(limited.status).toBe(429)
    expect(limited.headers['retry-after']).toBeString()
    expect((await login('other@example.com', 'wrong password')).status).toBe(401)
  })
})

describe('refresh', () => {
  it('rotates the refresh token', async () => {
    const { res } = await signedIn('ada@example.com')
    const old = tokenFromCookie(res, 'refresh_token')
    const rotated = await refreshWith(old)

    expect(rotated.status).toBe(200)
    expect(tokenFromCookie(rotated, 'refresh_token')).not.toBe(old)
    expect(body(rotated).user.email).toBe('ada@example.com')
  })

  it('accepts the token in the body', async () => {
    const { res } = await signedIn('ada@example.com')
    const rotated = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: body(res).tokens.refreshToken })

    expect(rotated.status).toBe(200)
  })

  it('answers 400 with neither cookie nor body', async () => {
    const res = await request(app).post('/api/auth/refresh')

    expect(res.status).toBe(400)
    expect(body(res).error.code).toBe('validation_failed')
  })

  it('answers 401 for a garbage token', async () => {
    expect((await refreshWith('not-a-jwt')).status).toBe(401)
  })

  it('revokes all sessions when a rotated token is replayed after the grace window', async () => {
    const a = await register('ada@example.com')
    const b = await login('ada@example.com')
    const a1 = tokenFromCookie(a, 'refresh_token')
    const a2 = tokenFromCookie(await refreshWith(a1), 'refresh_token')
    setSystemTime(new Date(Date.now() + 31_000))

    expect((await refreshWith(a1)).status).toBe(401)
    expect((await refreshWith(a2)).status).toBe(401)
    expect((await refreshWith(tokenFromCookie(b, 'refresh_token'))).status).toBe(401)
  })

  it('rotates again when a rotated token is replayed inside the grace window', async () => {
    const a = await register('ada@example.com')
    const b = await login('ada@example.com')
    const a1 = tokenFromCookie(a, 'refresh_token')
    const a2 = tokenFromCookie(await refreshWith(a1), 'refresh_token')
    setSystemTime(new Date(Date.now() + 10_000))

    const retry = await refreshWith(a1)
    expect(retry.status).toBe(200)
    expect(tokenFromCookie(retry, 'refresh_token')).toBe(a2)
    expect((await refreshWith(tokenFromCookie(b, 'refresh_token'))).status).toBe(200)
    // The retry holder and the first holder share one live token, so neither looks like a replay.
    setSystemTime(new Date(Date.now() + 60_000))
    expect((await refreshWith(a2)).status).toBe(200)
  })

  it('answers two simultaneous refreshes with one cookie with the same token', async () => {
    const { res } = await signedIn('ada@example.com')
    const old = tokenFromCookie(res, 'refresh_token')

    const [one, two] = await Promise.all([refreshWith(old), refreshWith(old)])

    expect(one.status).toBe(200)
    expect(two.status).toBe(200)
    expect(body(one).tokens.refreshToken).toBe(body(two).tokens.refreshToken)
    expect(body(one).tokens.refreshToken).not.toBe(old)
  })

  it('answers 403 for a blocked account', async () => {
    const { res } = await signedIn('ada@example.com')
    await block(body(res).user.id)

    expect((await refreshWith(tokenFromCookie(res, 'refresh_token'))).status).toBe(403)
  })
})

describe('logout', () => {
  it('answers 204, clears the cookies and kills the refresh token', async () => {
    const { res, bearer } = await signedIn('ada@example.com')
    const out = await request(app).post('/api/auth/logout').set('Authorization', bearer)

    expect(out.status).toBe(204)
    expect(cookieLine(out, 'access_token')).toContain('Expires=Thu, 01 Jan 1970')
    expect(cookieLine(out, 'refresh_token')).toContain('Expires=Thu, 01 Jan 1970')
    expect((await refreshWith(tokenFromCookie(res, 'refresh_token'))).status).toBe(401)
  })

  it('with all: true revokes a second device', async () => {
    const { bearer } = await signedIn('ada@example.com')
    const other = await login('ada@example.com')
    const out = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', bearer)
      .send({ all: true })

    expect(out.status).toBe(204)
    expect((await refreshWith(tokenFromCookie(other, 'refresh_token'))).status).toBe(401)
  })

  it('without all leaves a second device signed in', async () => {
    const { bearer } = await signedIn('ada@example.com')
    const other = await login('ada@example.com')
    await request(app).post('/api/auth/logout').set('Authorization', bearer)

    expect((await refreshWith(tokenFromCookie(other, 'refresh_token'))).status).toBe(200)
  })

  it('answers 401 when unauthenticated', async () => {
    expect((await request(app).post('/api/auth/logout')).status).toBe(401)
  })

  it('issues an access token from the body that works as a bearer on GET /api/user/me', async () => {
    const { bearer } = await signedIn('ada@example.com')
    const me = await request(app).get('/api/user/me').set('Authorization', bearer)

    expect(me.status).toBe(200)
    expect(body(me).email).toBe('ada@example.com')
  })
})

describe('otp request', () => {
  it('answers 202 for an unknown target and sends nothing', async () => {
    const res = await request(app)
      .post('/api/auth/otp')
      .send({ target: { type: 'email', value: 'nobody@example.com' }, purpose: 'login' })

    await flush()
    expect(res.status).toBe(202)
    expect(sent).toHaveLength(0)
  })

  it('answers 202 for a known email and delivers the code by mail', async () => {
    await register('ada@example.com')
    sent = []
    const res = await request(app)
      .post('/api/auth/otp')
      .send({ target: { type: 'email', value: 'Ada@example.com' }, purpose: 'login' })

    await flush()
    expect(res.status).toBe(202)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.channel).toBe('mail')
    expect(sent[0]?.template.name).toBe('otp')
    expect(codeOf(sent[0])).toMatch(/^\d{6}$/)
  })

  it('answers 400 for a malformed target', async () => {
    const res = await request(app)
      .post('/api/auth/otp')
      .send({ target: { type: 'phone', value: '12345' }, purpose: 'login' })

    expect(res.status).toBe(400)
  })

  it('delivers by sms for a verified phone target', async () => {
    const { res: signedUp, bearer } = await signedIn('ada@example.com')
    await request(app)
      .patch('/api/user/me')
      .set('Authorization', bearer)
      .send({ phone: '+14155550123' })
    await verifyContact(body(signedUp).user.id, 'phone')
    sent = []
    const res = await request(app)
      .post('/api/auth/otp')
      .send({ target: { type: 'phone', value: '+14155550123' }, purpose: 'login' })

    await flush()
    expect(res.status).toBe(202)
    expect(sent[0]?.channel).toBe('sms')
    expect(sent[0]?.to).toBe('+14155550123')
  })

  it("the console provider's log line never contains the code", async () => {
    // Asserted: the code is in the delivered message text, while the console provider's own log
    // line carries the template name and channel only. The controller and otp.ts write no log
    // line on the delivery path at all.
    const lines: string[] = []
    const push = (line: string) => void lines.push(line)
    const logger = createLogger({ quiet: false, sink: { info: push, warn: push, error: push } })
    const target = { type: 'email', value: 'ada@example.com' }
    await register('ada@example.com')
    const provider = createConsoleProvider('mail', { logger, development: false })
    registerProvider('mail', {
      send(message) {
        sent.push(message)
        return provider.send(message)
      },
    })
    sent = []
    await request(app).post('/api/auth/otp').send({ target, purpose: 'login' })
    await flush()

    const code = codeOf(sent[0])
    expect(code).toMatch(/^\d{6}$/)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('template=otp')
    expect(lines[0]).not.toContain(code ?? 'missing')
  })

  it('answers 202 for a blocked account and delivers nothing', async () => {
    const { res } = await signedIn('ada@example.com')
    await block(body(res).user.id)
    sent = []
    const out = await request(app)
      .post('/api/auth/otp')
      .send({ target: { type: 'email', value: 'ada@example.com' }, purpose: 'login' })
    await flush()

    expect(out.status).toBe(202)
    expect(sent).toHaveLength(0)
  })

  it('answers 403 for verify on another user phone', async () => {
    const bob = await signedIn('bob@example.com')
    await request(app)
      .patch('/api/user/me')
      .set('Authorization', bob.bearer)
      .send({ phone: '+14155550199' })
    const { bearer } = await signedIn('ada@example.com')
    const out = await request(app)
      .post('/api/auth/otp')
      .set('Authorization', bearer)
      .send({ target: { type: 'phone', value: '+14155550199' }, purpose: 'verify' })

    expect(out.status).toBe(403)
  })

  it('answers 401 for verify when the caller account was deleted', async () => {
    const { res, bearer } = await signedIn('ada@example.com')
    await getDb().collection('user').delete(body(res).user.id)
    const out = await request(app)
      .post('/api/auth/otp')
      .set('Authorization', bearer)
      .send({ target: { type: 'email', value: 'ada@example.com' }, purpose: 'verify' })

    expect(out.status).toBe(401)
  })

  it('sets Cache-Control: no-store on token-issuing responses', async () => {
    const res = await register('ada@example.com')

    expect(res.headers['cache-control']).toBe('no-store')
    expect((await login('ada@example.com')).headers['cache-control']).toBe('no-store')
  })

  it('answers 401 for verify without a caller', async () => {
    const res = await request(app)
      .post('/api/auth/otp')
      .send({ target: { type: 'email', value: 'ada@example.com' }, purpose: 'verify' })

    expect(res.status).toBe(401)
  })

  it('answers 403 for verify on another user email', async () => {
    await register('ada@example.com')
    const { bearer } = await signedIn('bob@example.com')
    const res = await request(app)
      .post('/api/auth/otp')
      .set('Authorization', bearer)
      .send({ target: { type: 'email', value: 'ada@example.com' }, purpose: 'verify' })

    expect(res.status).toBe(403)
  })

  it('is limited per target', async () => {
    const payload = { target: { type: 'email', value: 'ada@example.com' }, purpose: 'login' }
    for (let i = 0; i < 5; i++) {
      expect((await request(app).post('/api/auth/otp').send(payload)).status).toBe(202)
    }
    const limited = await request(app).post('/api/auth/otp').send(payload)

    expect(limited.status).toBe(429)
    expect(limited.headers['retry-after']).toBeString()
  })
})

describe('otp verification', () => {
  const target = { type: 'email', value: 'ada@example.com' }
  const verify = (code: string, purpose = 'login') =>
    request(app).post('/api/auth/otp/verification').send({ target, purpose, code })

  async function requestLoginCode(): Promise<string> {
    await register('ada@example.com')
    sent = []
    await request(app).post('/api/auth/otp').send({ target, purpose: 'login' })
    await flush()
    return codeOf(sent[0]) ?? ''
  }

  it('answers 200 with tokens for login and consumes the code', async () => {
    const code = await requestLoginCode()
    const res = await verify(code)

    expect(res.status).toBe(200)
    expect(body(res).tokens.accessToken).toBeString()
    expect(tokenFromCookie(res, 'access_token')).toBe(body(res).tokens.accessToken)
    expect((await verify(code)).status).toBe(401)
  })

  it('answers 401 for a wrong code', async () => {
    const code = await requestLoginCode()

    expect((await verify(code === '000000' ? '111111' : '000000')).status).toBe(401)
  })

  it('answers 400 for a code that is not six digits', async () => {
    expect((await verify('12ab')).status).toBe(400)
  })

  it('deletes the code on the fifth wrong attempt', async () => {
    const code = await requestLoginCode()
    const wrong = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i++) expect((await verify(wrong)).status).toBe(401)

    expect((await verify(code)).status).toBe(401)
  })

  it('answers 401 for an expired code', async () => {
    const code = await requestLoginCode()
    setSystemTime(new Date(Date.now() + 11 * 60_000))

    expect((await verify(code)).status).toBe(401)
  })

  it('sets emailVerifiedAt on verify and returns no tokens', async () => {
    const { bearer } = await signedIn('ada@example.com')
    sent = []
    await request(app)
      .post('/api/auth/otp')
      .set('Authorization', bearer)
      .send({ target, purpose: 'verify' })
    const res = await request(app)
      .post('/api/auth/otp/verification')
      .set('Authorization', bearer)
      .send({ target, purpose: 'verify', code: codeOf(sent[0]) })

    expect(res.status).toBe(200)
    expect(body(res).user.emailVerifiedAt).toBeString()
    expect(body(res).tokens).toBeUndefined()
    expect(cookiesOf(res)).toHaveLength(0)
  })

  it('answers 401 for verify without a caller', async () => {
    expect((await verify('123456', 'verify')).status).toBe(401)
  })

  it('answers 403 for verify on another user email, without consuming the code', async () => {
    const { bearer } = await signedIn('bob@example.com')
    const code = await requestLoginCode()
    const res = await request(app)
      .post('/api/auth/otp/verification')
      .set('Authorization', bearer)
      .send({ target, purpose: 'verify', code })

    expect(res.status).toBe(403)
    expect((await verify(code)).status).toBe(200)
  })

  it('answers 403 when a code issued before the account was blocked is used', async () => {
    const code = await requestLoginCode()
    const account = await userRepository.findByEmail('ada@example.com')
    await block(account?.id ?? '')
    const out = await verify(code)

    expect(out.status).toBe(403)
    expect(body(out).error.code).toBe('forbidden')
  })

  it('verifies the caller own phone target and returns no tokens', async () => {
    const { bearer } = await signedIn('ada@example.com')
    const phone = { type: 'phone', value: '+14155550123' }
    await request(app)
      .patch('/api/user/me')
      .set('Authorization', bearer)
      .send({ phone: phone.value })
    sent = []
    await request(app)
      .post('/api/auth/otp')
      .set('Authorization', bearer)
      .send({ target: phone, purpose: 'verify' })
    const out = await request(app)
      .post('/api/auth/otp/verification')
      .set('Authorization', bearer)
      .send({ target: phone, purpose: 'verify', code: codeOf(sent[0]) })

    expect(sent[0]?.channel).toBe('sms')
    expect(out.status).toBe(200)
    expect(body(out).user.phoneVerifiedAt).toBeString()
    expect(body(out).tokens).toBeUndefined()
  })

  it('answers 403 for verify on another user phone', async () => {
    const bob = await signedIn('bob@example.com')
    await request(app)
      .patch('/api/user/me')
      .set('Authorization', bob.bearer)
      .send({ phone: '+14155550199' })
    const { bearer } = await signedIn('ada@example.com')
    const out = await request(app)
      .post('/api/auth/otp/verification')
      .set('Authorization', bearer)
      .send({ target: { type: 'phone', value: '+14155550199' }, purpose: 'verify', code: '123456' })

    expect(out.status).toBe(403)
  })
})

describe('otp login verifies the target', () => {
  const target = { type: 'email', value: 'ada@example.com' }
  const verifyLogin = (code: string | undefined) =>
    request(app).post('/api/auth/otp/verification').send({ target, purpose: 'login', code })

  async function loginCode(): Promise<string | undefined> {
    sent = []
    await request(app).post('/api/auth/otp').send({ target, purpose: 'login' })
    await flush()
    return codeOf(sent[0])
  }

  it('sets emailVerifiedAt and revokes the sessions that existed before', async () => {
    const first = await register('ada@example.com')
    const other = await login('ada@example.com')

    const out = await verifyLogin(await loginCode())

    expect(out.status).toBe(200)
    expect(body(out).user.emailVerifiedAt).toBeString()
    expect((await refreshWith(tokenFromCookie(first, 'refresh_token'))).status).toBe(401)
    expect((await refreshWith(tokenFromCookie(other, 'refresh_token'))).status).toBe(401)
  })

  it('keeps the other sessions when the email was already verified', async () => {
    const first = await register('ada@example.com')
    await verifyContact(body(first).user.id, 'email')
    const other = await login('ada@example.com')

    const out = await verifyLogin(await loginCode())

    expect(out.status).toBe(200)
    expect((await refreshWith(tokenFromCookie(other, 'refresh_token'))).status).toBe(200)
    expect((await refreshWith(tokenFromCookie(out, 'refresh_token'))).status).toBe(200)
  })
})

describe('phone ownership', () => {
  const phone = { type: 'phone', value: '+14155550123' }
  const claim = (bearer: string) =>
    request(app).patch('/api/user/me').set('Authorization', bearer).send({ phone: phone.value })

  it('does not send the owner login code to a phone an attacker claimed unverified', async () => {
    const attacker = await signedIn('mallory@example.com')
    await claim(attacker.bearer)
    sent = []

    const res = await request(app).post('/api/auth/otp').send({ target: phone, purpose: 'login' })
    await flush()

    expect(res.status).toBe(202)
    expect(sent).toHaveLength(0)
  })

  it('lets the owner claim and verify the number the attacker typed first', async () => {
    const attacker = await signedIn('mallory@example.com')
    await claim(attacker.bearer)
    const owner = await signedIn('ada@example.com')
    expect((await claim(owner.bearer)).status).toBe(200)
    sent = []
    await request(app)
      .post('/api/auth/otp')
      .set('Authorization', owner.bearer)
      .send({ target: phone, purpose: 'verify' })

    const out = await request(app)
      .post('/api/auth/otp/verification')
      .set('Authorization', owner.bearer)
      .send({ target: phone, purpose: 'verify', code: codeOf(sent[0]) })

    expect(out.status).toBe(200)
    expect(body(out).user.phoneVerifiedAt).toBeString()
  })

  it('answers 409 when the number is already verified by another user', async () => {
    const owner = await signedIn('ada@example.com')
    await claim(owner.bearer)
    await verifyContact(body(owner.res).user.id, 'phone')
    const attacker = await signedIn('mallory@example.com')
    // The claim itself is refused up front; store it directly to test verification as well.
    expect((await claim(attacker.bearer)).status).toBe(409)
    const record = await userRepository.findById(body(attacker.res).user.id)
    if (record === undefined) throw new Error('user missing')
    await userRepository.update({ ...record, phone: phone.value })
    sent = []
    await request(app)
      .post('/api/auth/otp')
      .set('Authorization', attacker.bearer)
      .send({ target: phone, purpose: 'verify' })

    const out = await request(app)
      .post('/api/auth/otp/verification')
      .set('Authorization', attacker.bearer)
      .send({ target: phone, purpose: 'verify', code: codeOf(sent[0]) })

    expect(out.status).toBe(409)
    expect(body(out).error.code).toBe('conflict')
  })
})

describe('delivery failures', () => {
  it('answers 503 for a verify code when the provider fails, without leaking its message', async () => {
    registerProvider('mail', {
      send: () => Promise.reject(new Error('vendor echoed code 424242')),
    })
    const { bearer } = await signedIn('ada@example.com')

    const out = await request(app)
      .post('/api/auth/otp')
      .set('Authorization', bearer)
      .send({ target: { type: 'email', value: 'ada@example.com' }, purpose: 'verify' })

    expect(out.status).toBe(503)
    expect(body(out).error.code).toBe('upstream_unavailable')
    expect(JSON.stringify(out.body)).not.toContain('424242')
  })
})
