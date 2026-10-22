import { randomUUID } from 'node:crypto'

import { beforeEach, expect, it } from 'bun:test'
import request from 'supertest'

import * as userService from '../../src/api/user/service'
import { pubsub } from '../../src/infra/pubsub'
import type { UserRecord } from '../../src/models/user/interface'
import { app } from '../../src/server'
import { signAccess } from '../../src/services/security/jwt'
import { classifyPostgresError } from '../../src/services/utils/postgres-error'
import { describeStore, resetStore } from '../store'

type ErrorBody = { error: { code: string }; requestId: string }

function record(email: string, overrides: Partial<UserRecord> = {}): UserRecord {
  const now = new Date()
  return {
    id: randomUUID(),
    email,
    role: 'user',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected the promise to reject')
}

beforeEach(async () => {
  await resetStore()
})

describeStore('user service on postgres', () => {
  it('maps a second insert of the same email to a conflict', async () => {
    await userService.insert(record('dup@example.com'))

    const error = await rejection(userService.insert(record('dup@example.com')))

    expect(classifyPostgresError(error)).toMatchObject({ code: 'conflict' })
  })

  it('lets an unverified phone be claimed twice but a verified one only once', async () => {
    await userService.insert(record('a@example.com', { phone: '+15550001' }))
    await userService.insert(record('b@example.com', { phone: '+15550001' }))
    expect(await userService.findByVerifiedPhone('+15550001')).toBeUndefined()

    await userService.insert(
      record('c@example.com', { phone: '+15550002', phoneVerifiedAt: new Date() }),
    )
    const error = await rejection(
      userService.insert(
        record('d@example.com', { phone: '+15550002', phoneVerifiedAt: new Date() }),
      ),
    )

    expect(classifyPostgresError(error)).toMatchObject({ code: 'conflict' })
    expect((await userService.findByVerifiedPhone('+15550002'))?.email).toBe('c@example.com')
  })

  it('clears optional fields the record omits and omits absent ones when reading', async () => {
    const created = await userService.insert(
      record('x@example.com', { phone: '+15550003', phoneVerifiedAt: new Date() }),
    )
    const { phone: _phone, phoneVerifiedAt: _verified, ...bare } = created

    const updated = await userService.update(bare)

    expect(updated).not.toHaveProperty('phone')
    expect(updated).not.toHaveProperty('phoneVerifiedAt')
    expect(await userService.findByEmail('x@example.com')).toEqual(updated)
  })
})

describeStore('GET /api/user on postgres', () => {
  it('answers 400 validation_failed for a forged cursor with a non-date createdAt', async () => {
    const boss = await userService.insert(record('boss@example.com', { role: 'admin' }))
    const { token } = await signAccess({ sub: boss.id, role: 'admin', sid: randomUUID() })
    const cursor = Buffer.from(JSON.stringify({ createdAt: 'x', id: 'y' })).toString('base64url')

    const res = await request(app)
      .get('/api/user')
      .query({ cursor })
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(400)
    expect((res.body as ErrorBody).error.code).toBe('validation_failed')
  })
})

describeStore('POST /api/auth/register on postgres', () => {
  it('answers one 201 and one 409 conflict for two concurrent registrations of one email', async () => {
    await pubsub.connect()
    try {
      const send = () =>
        request(app)
          .post('/api/auth/register')
          .send({ email: 'race@example.com', password: 'correct horse battery' })

      const responses = await Promise.all([send(), send()])

      const statuses = responses.map((res) => res.status).sort()
      expect(statuses).toEqual([201, 409])
      const failed = responses.find((res) => res.status === 409)
      if (failed === undefined) throw new Error('no 409 response')
      const body = failed.body as ErrorBody
      expect(body.error.code).toBe('conflict')
      expect(failed.headers['x-request-id']).toBe(body.requestId)
      expect(JSON.stringify(body)).not.toContain('user_email_idx')
    } finally {
      await pubsub.close()
    }
  })
})
