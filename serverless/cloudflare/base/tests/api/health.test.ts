import { env } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'

import healthRoutes from '../../server/api/health/routes'
import { json, mounted, send } from './helpers'

type Readiness = { status: string; dependencies: Record<string, string> }

describe('GET /api/health', () => {
  it('reports ok with the uptime and the package version, and echoes a request id', async () => {
    const res = await send('/api/health')
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({
      status: 'ok',
      uptimeSeconds: expect.any(Number),
      version: expect.stringMatching(/^\d+\.\d+\.\d+/),
    })
    expect(res.headers.get('x-request-id')).toBeTruthy()
  })

  it('counts the uptime from the isolate start, not from the epoch', async () => {
    const body = await json<{ uptimeSeconds: number }>(await send('/api/health'))
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0)
    expect(body.uptimeSeconds).toBeLessThan(3600)
  })

  it('honours a well-formed incoming request id', async () => {
    const res = await send('/api/health', { headers: { 'x-request-id': 'probe-request-1' } })
    expect(res.headers.get('x-request-id')).toBe('probe-request-1')
  })
})

describe('GET /api/health/ready', () => {
  it('pings the database and lists it as ok', async () => {
    const res = await send('/api/health/ready')
    expect(res.status).toBe(200)
    expect(await json<Readiness>(res)).toEqual({ status: 'ok', dependencies: { database: 'ok' } })
  })

  it('reports degraded with 503 when the database ping fails, with the same body shape', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const down = {
      ...env,
      ENVIRONMENT: 'test',
      DB: {
        prepare() {
          throw new Error('D1 is down')
        },
      },
    }
    const res = await mounted(healthRoutes, '/api/health')('/api/health/ready', { bindings: down })
    expect(res.status).toBe(503)
    const body = await json<Readiness>(res)
    expect(body).toEqual({ status: 'degraded', dependencies: { database: 'down' } })
    expect(JSON.stringify(body)).not.toContain('D1 is down')
  })
})
