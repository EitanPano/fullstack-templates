import { describe, expect, it } from 'bun:test'
import { Router } from 'express'
import request from 'supertest'

import adminRoutes from '../src/api/admin/routes'
import { signAccess } from '../src/services/security/jwt' // @auth
import { app } from '../src/server'

// A throwaway module mounted in the namespace, for this file only: the template ships none.
const probe = Router()
let handled = 0
probe.get('/', (_req, res) => {
  res.json({ ok: true })
})
probe.post('/', (_req, res) => {
  handled++
  res.json({ ok: true })
})
adminRoutes.use('/probe', probe)

type ErrorBody = { error: { code: string }; requestId: string }

// @auth-start
async function bearer(role: 'user' | 'admin'): Promise<string> {
  const { token } = await signAccess({ sub: 'u', role, sid: 's' })
  return `Bearer ${token}`
}

describe('/api/admin with accounts', () => {
  it('answers 401 without a session, for a known and an unknown path alike', async () => {
    for (const path of ['/api/admin/probe', '/api/admin/nothing-here']) {
      const res = await request(app).get(path)
      const body = res.body as ErrorBody

      expect(res.status).toBe(401)
      expect(body.error.code).toBe('unauthenticated')
      expect(res.header['x-request-id']).toBe(body.requestId)
    }
  })

  it('answers 403 for a signed-in caller without the admin role, on any path', async () => {
    for (const path of ['/api/admin/probe', '/api/admin/nothing-here']) {
      const res = await request(app)
        .get(path)
        .set('Authorization', await bearer('user'))

      expect(res.status).toBe(403)
      expect((res.body as ErrorBody).error.code).toBe('forbidden')
    }
  })

  it('gates a case variant of the path as it gates the path itself (Express routes ignore case)', async () => {
    const res = await request(app).get('/API/ADMIN/probe')

    expect(res.status).toBe(401)
    expect((res.body as ErrorBody).error.code).toBe('unauthenticated')
  })

  // The body parser runs app-wide, before the gate: a malformed body is refused there, with the
  // validation envelope and no route-specific detail, and never reaches the module.
  it('refuses an anonymous POST with a malformed JSON body before the module runs', async () => {
    handled = 0
    const res = await request(app)
      .post('/api/admin/probe')
      .set('Content-Type', 'application/json')
      .send('{"broken":')

    expect(res.status).toBe(400)
    expect((res.body as ErrorBody).error.code).toBe('validation_failed')
    expect(handled).toBe(0)
  })

  it('lets an admin reach a module mounted in the namespace', async () => {
    const res = await request(app)
      .get('/api/admin/probe')
      .set('Authorization', await bearer('admin'))

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('answers an admin the JSON 404 for an unknown admin path', async () => {
    const res = await request(app)
      .get('/api/admin/nothing-here')
      .set('Authorization', await bearer('admin'))
    const body = res.body as ErrorBody

    expect(res.status).toBe(404)
    expect(body.error.code).toBe('not_found')
    expect(res.header['x-request-id']).toBe(body.requestId)
  })
})
// @auth-end
// @noauth-start
describe('/api/admin without accounts', () => {
  it('refuses every admin path with 403, mounted module or not', async () => {
    for (const path of ['/api/admin/probe', '/api/admin/nothing-here']) {
      const res = await request(app).get(path)
      const body = res.body as ErrorBody

      expect(res.status).toBe(403)
      expect(body.error.code).toBe('forbidden')
      expect(res.header['x-request-id']).toBe(body.requestId)
    }
  })

  it('refuses a case variant of the path with 403', async () => {
    const res = await request(app).get('/API/ADMIN/probe')

    expect(res.status).toBe(403)
    expect((res.body as ErrorBody).error.code).toBe('forbidden')
  })

  it('refuses a POST with a malformed JSON body before the module runs (the app-wide parser answers)', async () => {
    handled = 0
    const res = await request(app)
      .post('/api/admin/probe')
      .set('Content-Type', 'application/json')
      .send('{"broken":')

    expect(res.status).toBe(400)
    expect((res.body as ErrorBody).error.code).toBe('validation_failed')
    expect(handled).toBe(0)
  })

  it('refuses a well-formed POST with 403 and never runs the module', async () => {
    handled = 0
    const res = await request(app).post('/api/admin/probe').send({ a: 1 })

    expect(res.status).toBe(403)
    expect(handled).toBe(0)
  })

  it('refuses the other methods too', async () => {
    const res = await request(app).post('/api/admin/probe').send({})

    expect(res.status).toBe(403)
  })
})
// @noauth-end
