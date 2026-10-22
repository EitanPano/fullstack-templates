import { randomUUID } from 'node:crypto'

import { beforeEach, describe, expect, it } from 'bun:test'
import request from 'supertest'

import * as user from '../src/api/user/controller'
import * as repository from '../src/api/user/repository'
import { memory } from '../src/infra/memory'
import type { UserRole } from '../src/models/user/enum'
import type { PublicUser } from '../src/models/user/type'
import { app } from '../src/server'
import { drain, subscribe } from '../src/services/event'
import { signAccess } from '../src/services/security/jwt'

beforeEach(async () => {
  await memory.close()
})

const PASSWORD = 'correct horse battery'

function makeUser(email: string) {
  return user.createUser({ input: { email, password: PASSWORD } })
}

// The auth endpoints arrive in the next task, so tests mint the access token directly.
async function tokenFor(account: PublicUser, role: UserRole = account.role): Promise<string> {
  return (await signAccess({ sub: account.id, role, sid: randomUUID() })).token
}

const bearer = async (account: PublicUser) => `Bearer ${await tokenFor(account)}`

async function admin(email = 'admin@example.com') {
  const account = await makeUser(email)
  return user.setUserRole({ id: account.id, role: 'admin' })
}

// Resolves to the error a promise rejects with (bun's typed `rejects` matcher is not awaitable).
const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  )

type ErrorBody = { error: { code: string; message: string } }
type Page = { items: PublicUser[]; nextCursor: string | null }

describe('GET /api/user/me', () => {
  it('answers 401 without credentials', async () => {
    const res = await request(app).get('/api/user/me')

    expect(res.status).toBe(401)
    expect((res.body as ErrorBody).error.code).toBe('unauthenticated')
  })

  it('answers 200 with the access_token cookie', async () => {
    const account = await makeUser('a@example.com')

    const res = await request(app)
      .get('/api/user/me')
      .set('Cookie', `access_token=${await tokenFor(account)}`)

    expect(res.status).toBe(200)
    expect((res.body as PublicUser).email).toBe('a@example.com')
  })

  it('answers 200 with a bearer token and never exposes the hash', async () => {
    const account = await makeUser('a@example.com')

    const res = await request(app)
      .get('/api/user/me')
      .set('Authorization', await bearer(account))

    expect(res.status).toBe(200)
    expect(res.body).not.toHaveProperty('passwordHash')
    expect(JSON.stringify(res.body)).not.toContain('argon2')
    expect(res.body).toMatchObject({ id: account.id, phone: null, role: 'user', status: 'active' })
  })

  it('answers 401 when the account behind a valid token is gone', async () => {
    const account = await makeUser('a@example.com')
    const header = await bearer(account)
    await memory.close()

    const res = await request(app).get('/api/user/me').set('Authorization', header)

    expect(res.status).toBe(401)
    expect((res.body as ErrorBody).error.code).toBe('unauthenticated')
  })
})

describe('PATCH /api/user/me', () => {
  const patch = async (account: PublicUser, body: object) =>
    request(app)
      .patch('/api/user/me')
      .set('Authorization', await bearer(account))
      .send(body)

  it('sets a phone, leaves it when absent and clears it with null', async () => {
    const account = await makeUser('a@example.com')

    const set = await patch(account, { phone: '+14155550101' })
    expect(set.status).toBe(200)
    expect((set.body as PublicUser).phone).toBe('+14155550101')

    const untouched = await patch(account, {})
    expect(untouched.status).toBe(200)
    expect((untouched.body as PublicUser).phone).toBe('+14155550101')

    const cleared = await patch(account, { phone: null })
    expect(cleared.status).toBe(200)
    expect((cleared.body as PublicUser).phone).toBeNull()
  })

  it('clears phoneVerifiedAt when the phone changes', async () => {
    const account = await makeUser('a@example.com')
    await patch(account, { phone: '+14155550101' })
    const verified = await user.markVerified({ id: account.id, type: 'phone' })
    expect(verified.phoneVerifiedAt).not.toBeNull()

    const res = await patch(account, { phone: '+14155550102' })

    expect((res.body as PublicUser).phoneVerifiedAt).toBeNull()
  })

  it('answers 400 for a phone that is not E.164', async () => {
    const account = await makeUser('a@example.com')

    const res = await patch(account, { phone: '0415 555' })

    expect(res.status).toBe(400)
    expect((res.body as ErrorBody).error.code).toBe('validation_failed')
  })

  it('answers 409 when another user has verified the phone', async () => {
    const first = await makeUser('a@example.com')
    const second = await makeUser('b@example.com')
    await patch(first, { phone: '+14155550101' })
    await user.markVerified({ id: first.id, type: 'phone' })

    const res = await patch(second, { phone: '+14155550101' })

    expect(res.status).toBe(409)
    expect((res.body as ErrorBody).error.code).toBe('conflict')
  })

  it('accepts a phone another user only claimed without verifying', async () => {
    const first = await makeUser('a@example.com')
    const second = await makeUser('b@example.com')
    await patch(first, { phone: '+14155550101' })

    expect((await patch(second, { phone: '+14155550101' })).status).toBe(200)
  })

  it('answers 401 when the account behind the token is gone', async () => {
    const account = await makeUser('a@example.com')
    const header = await bearer(account)
    await memory.close()

    const res = await request(app).patch('/api/user/me').set('Authorization', header).send({})

    expect(res.status).toBe(401)
  })

  it('answers 401 without credentials', async () => {
    const res = await request(app).patch('/api/user/me').send({})

    expect(res.status).toBe(401)
  })
})

describe('GET /api/user', () => {
  it('answers 403 for a user caller', async () => {
    const account = await makeUser('a@example.com')

    const res = await request(app)
      .get('/api/user')
      .set('Authorization', await bearer(account))

    expect(res.status).toBe(403)
    expect((res.body as ErrorBody).error.code).toBe('forbidden')
  })

  it('answers 401 without credentials', async () => {
    expect((await request(app).get('/api/user')).status).toBe(401)
  })

  it('pages through the users with the cursor', async () => {
    const boss = await admin()
    await makeUser('b@example.com')
    await makeUser('c@example.com')
    const header = await bearer(boss)

    const first = await request(app).get('/api/user?limit=2').set('Authorization', header)
    expect(first.status).toBe(200)
    const firstPage = first.body as Page
    expect(firstPage.items).toHaveLength(2)
    expect(firstPage.nextCursor).not.toBeNull()

    const second = await request(app)
      .get('/api/user')
      .query({ limit: 2, cursor: firstPage.nextCursor })
      .set('Authorization', header)
    const secondPage = second.body as Page
    expect(secondPage.items).toHaveLength(1)
    expect(secondPage.nextCursor).toBeNull()

    const ids = [...firstPage.items, ...secondPage.items].map((item) => item.id)
    expect(new Set(ids).size).toBe(3)
  })

  it('answers 400 for limit=0 and for a garbage cursor', async () => {
    const header = await bearer(await admin())

    const zero = await request(app).get('/api/user?limit=0').set('Authorization', header)
    expect(zero.status).toBe(400)

    const garbage = await request(app).get('/api/user?cursor=nope').set('Authorization', header)
    expect(garbage.status).toBe(400)
  })
})

describe('GET /api/user/:id', () => {
  it('answers 404 for an unknown id', async () => {
    const header = await bearer(await admin())

    const res = await request(app).get('/api/user/missing').set('Authorization', header)

    expect(res.status).toBe(404)
    expect((res.body as ErrorBody).error.code).toBe('not_found')
  })

  it('answers 200 for an admin', async () => {
    const target = await makeUser('b@example.com')
    const header = await bearer(await admin())

    const res = await request(app).get(`/api/user/${target.id}`).set('Authorization', header)

    expect(res.status).toBe(200)
    expect((res.body as PublicUser).id).toBe(target.id)
  })

  it('answers 403 for a user caller', async () => {
    const target = await makeUser('b@example.com')

    const res = await request(app)
      .get(`/api/user/${target.id}`)
      .set('Authorization', await bearer(target))

    expect(res.status).toBe(403)
  })
})

describe('controller', () => {
  it('listUser rejects a user caller with forbidden (the service gate)', async () => {
    const account = await makeUser('a@example.com')

    expect(
      await rejection(
        user.listUser({
          query: { limit: 20 },
          caller: { id: account.id, role: 'user', sessionId: 's' },
        }),
      ),
    ).toMatchObject({ code: 'forbidden' })
  })

  it('getUser rejects a user caller with forbidden', async () => {
    const account = await makeUser('a@example.com')

    expect(
      await rejection(
        user.getUser({ id: account.id, caller: { id: account.id, role: 'user', sessionId: 's' } }),
      ),
    ).toMatchObject({ code: 'forbidden' })
  })

  it('createUser rejects the same email in another case', async () => {
    await makeUser('a@example.com')

    expect(await rejection(makeUser('  A@Example.COM '))).toMatchObject({
      code: 'conflict',
      message: 'email already registered',
    })
  })

  it('createUser stores a normalised email and publishes user.registered', async () => {
    const seen: string[] = []
    const unsubscribe = subscribe('user.registered', ({ userId }) => {
      seen.push(userId)
    })

    try {
      const created = await makeUser('  Mixed@Example.com ')
      await drain()
      expect(created.email).toBe('mixed@example.com')
      expect(created.role).toBe('user')
      expect(created.status).toBe('active')
      expect(seen).toEqual([created.id])
    } finally {
      unsubscribe()
    }
  })

  it('verifyCredentials returns the user for the right password', async () => {
    const created = await makeUser('a@example.com')

    const found = await user.verifyCredentials({
      input: { email: 'A@example.com', password: PASSWORD },
    })

    expect(found.id).toBe(created.id)
  })

  it('verifyCredentials gives an unknown email and a wrong password the same message', async () => {
    await makeUser('a@example.com')

    const unknown = await user
      .verifyCredentials({ input: { email: 'nobody@example.com', password: PASSWORD } })
      .catch((error: unknown) => error)
    const wrong = await user
      .verifyCredentials({ input: { email: 'a@example.com', password: 'wrong password' } })
      .catch((error: unknown) => error)

    expect(unknown).toMatchObject({ code: 'unauthenticated', message: 'invalid credentials' })
    expect(wrong).toMatchObject({ code: 'unauthenticated', message: 'invalid credentials' })
  })

  it('verifyCredentials rejects a blocked user with forbidden only after the password', async () => {
    const created = await makeUser('a@example.com')
    const record = await repository.findById(created.id)
    if (record === undefined) throw new Error('record missing')
    await repository.update({ ...record, status: 'blocked' })

    expect(
      await rejection(
        user.verifyCredentials({ input: { email: 'a@example.com', password: PASSWORD } }),
      ),
    ).toMatchObject({ code: 'forbidden', message: 'account blocked' })
    expect(
      await rejection(
        user.verifyCredentials({ input: { email: 'a@example.com', password: 'wrong password' } }),
      ),
    ).toMatchObject({ code: 'unauthenticated' })
    expect(await rejection(user.getActiveUser(created.id))).toMatchObject({ code: 'forbidden' })
  })

  it('getActiveUser rejects an unknown id with not_found', async () => {
    expect(await rejection(user.getActiveUser('missing'))).toMatchObject({ code: 'not_found' })
  })

  it('findUserByTarget finds by email and by verified phone, and returns null otherwise', async () => {
    const created = await makeUser('a@example.com')
    await user.updateMe({
      caller: { id: created.id, role: 'user', sessionId: 's' },
      input: { phone: '+14155550101' },
    })
    const unverified = await user.findUserByTarget({
      target: { type: 'phone', value: '+14155550101' },
    })
    await user.markVerified({ id: created.id, type: 'phone' })

    const byEmail = await user.findUserByTarget({
      target: { type: 'email', value: 'a@example.com' },
    })
    const byPhone = await user.findUserByTarget({
      target: { type: 'phone', value: '+14155550101' },
    })
    const none = await user.findUserByTarget({ target: { type: 'email', value: 'x@example.com' } })

    expect(unverified).toBeNull()
    expect(byEmail?.id).toBe(created.id)
    expect(byPhone?.id).toBe(created.id)
    expect(none).toBeNull()
  })

  it('markVerified sets the matching timestamp; setUserRole rejects an unknown id', async () => {
    const created = await makeUser('a@example.com')

    const verified = await user.markVerified({ id: created.id, type: 'email' })

    expect(verified.emailVerifiedAt).not.toBeNull()
    expect(verified.phoneVerifiedAt).toBeNull()
    expect(await rejection(user.setUserRole({ id: 'missing', role: 'admin' }))).toMatchObject({
      code: 'not_found',
    })
  })
})
