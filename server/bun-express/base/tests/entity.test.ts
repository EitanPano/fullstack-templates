import { randomUUID } from 'node:crypto'

import { beforeEach, expect, it } from 'bun:test'
import request from 'supertest'

import type { UserRole } from '../src/models/user/enum' // @auth
import { drain, subscribe } from '../src/services/event'
import { signAccess } from '../src/services/security/jwt' // @auth
import { app } from '../src/server'
import { describeStore, resetStore } from './store'

// @auth-start
// The route gates only read the access token, so callers are minted directly with signAccess
// rather than through api/user (which another task owns).
async function bearer(role: UserRole): Promise<string> {
  const { token } = await signAccess({ sub: randomUUID(), role, sid: randomUUID() })
  return `Bearer ${token}`
}
// @auth-end

type EntityBody = { id: string; name: string; status: string; createdAt: string; updatedAt: string }
type PageBody = { items: EntityBody[]; nextCursor: string | null }
type ErrorBody = { error: { code: string; details?: { path: string }[] } }

async function create(name: string): Promise<EntityBody> {
  const res = await request(app)
    .post('/api/entity')
    .set('Authorization', await bearer('user')) // @auth
    .send({ name })
  return res.body as EntityBody
}

beforeEach(async () => {
  await resetStore()
})

describeStore('GET /api/entity', () => {
  it('lists nothing when empty', async () => {
    const res = await request(app).get('/api/entity')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ items: [], nextCursor: null })
  })

  it('pages through every item with the cursor', async () => {
    await create('a')
    await create('b')
    await create('c')

    const first = await request(app).get('/api/entity?limit=2')
    const firstBody = first.body as PageBody
    expect(first.status).toBe(200)
    expect(firstBody.items).toHaveLength(2)
    expect(firstBody.nextCursor).not.toBeNull()

    const second = await request(app).get(
      `/api/entity?limit=2&cursor=${firstBody.nextCursor ?? ''}`,
    )
    const secondBody = second.body as PageBody
    expect(secondBody.items).toHaveLength(1)
    expect(secondBody.nextCursor).toBeNull()

    const ids = [...firstBody.items, ...secondBody.items].map((item) => item.id)
    expect(new Set(ids).size).toBe(3)
  })

  it('rejects an invalid cursor with 400', async () => {
    const res = await request(app).get('/api/entity?cursor=not-a-cursor')

    expect(res.status).toBe(400)
    expect((res.body as ErrorBody).error.code).toBe('validation_failed')
  })
})

describeStore('POST /api/entity', () => {
  it('creates an active entity with ISO timestamps', async () => {
    const res = await request(app)
      .post('/api/entity')
      .set('Authorization', await bearer('user')) // @auth
      .send({ name: '  First  ' })
    const body = res.body as EntityBody

    expect(res.status).toBe(201)
    expect(body.name).toBe('First')
    expect(body.status).toBe('active')
    expect(body.id).toMatch(/\S/)
    expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt)
    expect(new Date(body.updatedAt).toISOString()).toBe(body.updatedAt)
  })

  it('publishes entity.created with the new id after the write', async () => {
    const seen: string[] = []
    const unsubscribe = subscribe('entity.created', ({ entityId }) => {
      seen.push(entityId)
    })

    try {
      const created = await create('evented')
      await drain()
      expect(seen).toEqual([created.id])
    } finally {
      unsubscribe()
    }
  })

  // @auth-start
  it('answers 401 without a token', async () => {
    const res = await request(app).post('/api/entity').send({ name: 'x' })

    expect(res.status).toBe(401)
  })
  // @auth-end

  it.each([
    ['empty', ''],
    ['too long', 'x'.repeat(101)],
  ])('answers 400 for a name that is %s', async (_label, name) => {
    const res = await request(app)
      .post('/api/entity')
      .set('Authorization', await bearer('user')) // @auth
      .send({ name })
    const body = res.body as ErrorBody

    expect(res.status).toBe(400)
    expect(body.error.details?.[0]?.path).toBe('name')
  })
})

describeStore('GET /api/entity/:id', () => {
  it('returns the entity', async () => {
    const created = await create('one')

    const res = await request(app).get(`/api/entity/${created.id}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual(created)
  })

  it('answers 404 for an unknown id', async () => {
    const res = await request(app).get(`/api/entity/${randomUUID()}`)

    expect(res.status).toBe(404)
    expect((res.body as ErrorBody).error.code).toBe('not_found')
  })
})

describeStore('PATCH /api/entity/:id', () => {
  it('renames the entity and keeps createdAt', async () => {
    const created = await create('old')

    const res = await request(app)
      .patch(`/api/entity/${created.id}`)
      .set('Authorization', await bearer('user')) // @auth
      .send({ name: 'new' })
    const body = res.body as EntityBody

    expect(res.status).toBe(200)
    expect(body.name).toBe('new')
    expect(body.status).toBe('active')
    expect(body.createdAt).toBe(created.createdAt)
    expect(Date.parse(body.updatedAt)).toBeGreaterThanOrEqual(Date.parse(created.updatedAt))
  })

  it('archives the entity', async () => {
    const created = await create('keep')

    const res = await request(app)
      .patch(`/api/entity/${created.id}`)
      .set('Authorization', await bearer('user')) // @auth
      .send({ status: 'archived' })

    expect(res.status).toBe(200)
    expect((res.body as EntityBody).status).toBe('archived')
    expect((res.body as EntityBody).name).toBe('keep')
  })

  it('answers 400 for an empty body', async () => {
    const created = await create('x')

    const res = await request(app)
      .patch(`/api/entity/${created.id}`)
      .set('Authorization', await bearer('user')) // @auth
      .send({})

    expect(res.status).toBe(400)
  })

  it('answers 400 for an unknown status', async () => {
    const created = await create('x')

    const res = await request(app)
      .patch(`/api/entity/${created.id}`)
      .set('Authorization', await bearer('user')) // @auth
      .send({ status: 'deleted' })

    expect(res.status).toBe(400)
  })

  // @auth-start
  it('answers 401 without a token', async () => {
    const res = await request(app).patch(`/api/entity/${randomUUID()}`).send({ name: 'x' })

    expect(res.status).toBe(401)
  })
  // @auth-end

  it('answers 404 for an unknown id', async () => {
    const res = await request(app)
      .patch(`/api/entity/${randomUUID()}`)
      .set('Authorization', await bearer('user')) // @auth
      .send({ name: 'x' })

    expect(res.status).toBe(404)
  })
})

describeStore('DELETE /api/entity/:id', () => {
  // @auth-start
  it('answers 401 without a token', async () => {
    const res = await request(app).delete(`/api/entity/${randomUUID()}`)

    expect(res.status).toBe(401)
  })
  // @auth-end

  // @auth-start
  it('answers 403 for a user and keeps the entity', async () => {
    const created = await create('keep')

    const res = await request(app)
      .delete(`/api/entity/${created.id}`)
      .set('Authorization', await bearer('user'))

    expect(res.status).toBe(403)
    expect((await request(app).get(`/api/entity/${created.id}`)).status).toBe(200)
  })
  // @auth-end

  it('answers 204 for an admin, then 404 on get', async () => { // @auth
  it('answers 204, then 404 on get', async () => { // @noauth
    const created = await create('gone')

    const res = await request(app)
      .delete(`/api/entity/${created.id}`)
      .set('Authorization', await bearer('admin')) // @auth

    expect(res.status).toBe(204)
    expect(res.text).toBe('')
    expect((await request(app).get(`/api/entity/${created.id}`)).status).toBe(404)
  })

  it('answers 404 for an unknown id as admin', async () => { // @auth
  it('answers 404 for an unknown id', async () => { // @noauth
    const res = await request(app)
      .delete(`/api/entity/${randomUUID()}`)
      .set('Authorization', await bearer('admin')) // @auth

    expect(res.status).toBe(404)
  })
})
