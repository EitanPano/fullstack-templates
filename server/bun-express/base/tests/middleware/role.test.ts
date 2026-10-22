import { describe, expect, it } from 'bun:test'
import express from 'express'
import request from 'supertest'

import { errorHandler } from '../../src/middleware/error-handler'
import { requireRole } from '../../src/middleware/role'
import { signAccess } from '../../src/services/security/jwt'

type Body = { error: { code: string } }

function probe() {
  const app = express()
  app.get('/admin', requireRole('admin'), (_req, res) => {
    res.json({ ok: true })
  })
  app.get('/both', requireRole('user', 'admin'), (_req, res) => {
    res.json({ ok: true })
  })
  app.use(errorHandler)
  return app
}

const bearer = async (role: 'user' | 'admin') =>
  `Bearer ${(await signAccess({ sub: 'u', role, sid: 's' })).token}`

describe('requireRole', () => {
  it('answers 401 without a caller', async () => {
    const res = await request(probe()).get('/admin')

    expect(res.status).toBe(401)
    expect((res.body as Body).error.code).toBe('unauthenticated')
  })

  it('answers 403 for a caller without the role', async () => {
    const res = await request(probe())
      .get('/admin')
      .set('Authorization', await bearer('user'))

    expect(res.status).toBe(403)
    expect((res.body as Body).error.code).toBe('forbidden')
  })

  it('admits the role', async () => {
    const res = await request(probe())
      .get('/admin')
      .set('Authorization', await bearer('admin'))

    expect(res.status).toBe(200)
  })

  it('admits any of several roles', async () => {
    for (const role of ['user', 'admin'] as const) {
      const res = await request(probe())
        .get('/both')
        .set('Authorization', await bearer(role))
      expect(res.status).toBe(200)
    }
  })
})
