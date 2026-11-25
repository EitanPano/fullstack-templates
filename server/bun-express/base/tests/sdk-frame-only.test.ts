import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import express, { Router } from 'express'
import request from 'supertest'

import { env } from '../src/config/env'
import { errorHandler } from '../src/middleware/error-handler'
import { requestId } from '../src/middleware/request-id'
import { endPreflight, frameOnly, sdkGate } from '../src/middleware/sdk-gate'
import { resetStore } from './store'

const KEY = 'pk_test_a'
const A = 'https://a.example.test'
const PATH = '/api/sdk/v1/only-frame'
const SUB_PATH = '/api/sdk/v1/only-frame/view'

// A throwaway frame-only entity on a test app: the template ships none.
const probe = Router()
probe.get('/', (_req, res) => {
  res.json({ ok: true })
})
probe.post('/view', (_req, res) => {
  res.json({ counted: true })
})
const router = Router()
router.use(sdkGate)
router.use('/only-frame', frameOnly, probe)
router.use(endPreflight)
const app = express()
app.use(requestId)
app.use('/api/sdk/v1', router)
app.use(errorHandler)

const original = env.SDK_KEYS

beforeEach(async () => {
  env.SDK_KEYS = new Map([[KEY, [A]]])
  await resetStore()
})

afterEach(() => {
  env.SDK_KEYS = original
})

describe('frameOnly', () => {
  it('refuses a listed origin with its key on a frame-only route', async () => {
    const res = await request(app).get(PATH).set('Origin', A).set('X-Sdk-Key', KEY)

    expect(res.status).toBe(403)
    expect((res.body as { error: { code: string } }).error.code).toBe('forbidden')
    expect(res.header['access-control-allow-origin']).toBeUndefined()
  })

  it('refuses a listed origin with its key on a path under a frame-only route', async () => {
    const res = await request(app).post(SUB_PATH).set('Origin', A).set('X-Sdk-Key', KEY)

    expect(res.status).toBe(403)
    expect(res.header['access-control-allow-origin']).toBeUndefined()
  })

  it('answers a preflight for a path under a frame-only route with no allow header', async () => {
    const res = await request(app)
      .options(SUB_PATH)
      .set('Origin', A)
      .set('Access-Control-Request-Method', 'POST')

    expect(res.status).toBe(204)
    expect(res.header['access-control-allow-origin']).toBeUndefined()
  })

  it('answers a same-origin request with the key on a path under a frame-only route', async () => {
    const res = await request(app)
      .post(SUB_PATH)
      .set('Sec-Fetch-Site', 'same-origin')
      .set('X-Sdk-Key', KEY)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ counted: true })
  })

  it('answers a frame-only preflight with no allow header', async () => {
    const res = await request(app)
      .options(PATH)
      .set('Origin', A)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'x-sdk-key')

    expect(res.status).toBe(204)
    expect(res.header['access-control-allow-origin']).toBeUndefined()
    expect(res.header['access-control-allow-headers']).toBeUndefined()
    expect(res.header['access-control-max-age']).toBeUndefined()
  })

  it('answers a same-origin request with the key on a frame-only route', async () => {
    const res = await request(app)
      .get(PATH)
      .set('Sec-Fetch-Site', 'same-origin')
      .set('X-Sdk-Key', KEY)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('refuses a same-origin request without a key on a frame-only route', async () => {
    const res = await request(app).get(PATH).set('Sec-Fetch-Site', 'same-origin')

    expect(res.status).toBe(403)
  })

  it('still answers a preflight for a route that is not frame-only', async () => {
    const res = await request(app)
      .options('/api/sdk/v1/elsewhere')
      .set('Origin', A)
      .set('Access-Control-Request-Method', 'GET')

    expect(res.status).toBe(204)
    expect(res.header['access-control-allow-origin']).toBe(A)
  })
})
