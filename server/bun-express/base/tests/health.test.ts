import { describe, expect, it } from 'bun:test'
import express from 'express'
import request from 'supertest'

import { ready } from '../src/api/health/route'
import type { Resource } from '../src/infra/dependency'
import { app } from '../src/server'

const down: Resource = {
  name: 'db',
  connect: () => Promise.resolve(),
  ping: () => Promise.reject(new Error('connection refused')),
  close: () => Promise.resolve(),
}

describe('GET /api/health/ready', () => {
  // Through `app` the answer is the real dependency list: the memory store, the bus and the
  // scheduler, always ok. The probe apps below pin the other states with their own lists.
  it('lists the memory store, the bus and the scheduler as ok', async () => {
    const res = await request(app).get('/api/health/ready')

    const body = res.body as { status: string; dependencies: Record<string, string> }

    expect(res.status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.dependencies).toEqual({ memory: 'ok', pubsub: 'ok', scheduler: 'ok' })
  })

  it('answers ok with an empty dependency map when nothing is registered', async () => {
    const probe = express()
    probe.get('/ready', ready([]))

    const res = await request(probe).get('/ready')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok', dependencies: {} })
  })

  it('reports degraded with 503 when a resource ping fails', async () => {
    const probe = express()
    probe.get('/ready', ready([down]))

    const res = await request(probe).get('/ready')

    expect(res.status).toBe(503)
    expect(res.body).toEqual({ status: 'degraded', dependencies: { db: 'down' } })
  })
})

describe('GET /api/health', () => {
  it('reports ok and echoes a request id', async () => {
    const res = await request(app).get('/api/health')

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'ok' })
    expect(res.headers['x-request-id']).toMatch(/\S/)
  })

  it('honours a well-formed incoming request id', async () => {
    const res = await request(app).get('/api/health').set('x-request-id', 'trace-1234567890')

    expect(res.headers['x-request-id']).toBe('trace-1234567890')
  })
})

describe('unknown route', () => {
  it('returns the error envelope with code not_found', async () => {
    const res = await request(app).get('/api/does-not-exist')

    expect(res.status).toBe(404)
    expect(res.body).toEqual({
      error: { code: 'not_found', message: 'no route for GET /api/does-not-exist' },
      requestId: res.headers['x-request-id'],
    })
  })
})
