import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { stubApi } from '@/testing/stub-api'

import { healthService } from './health.service'

describe('healthService', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('returns the data of the liveness answer', async () => {
    const fetchMock = stubApi({
      'GET /api/health': Response.json({ status: 'ok', uptimeSeconds: 42, version: '1.2.3' }),
    })

    const health = await healthService.get()

    expect(health).toEqual({ status: 'ok', uptimeSeconds: 42, version: '1.2.3' })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('returns the readiness answer', async () => {
    stubApi({
      'GET /api/health/ready': Response.json({ status: 'degraded', dependencies: { db: 'down' } }),
    })

    expect(await healthService.ready()).toEqual({
      status: 'degraded',
      dependencies: { db: 'down' },
    })
  })

  it('rejects with what the API answered when the call fails', async () => {
    stubApi({
      'GET /api/health': Response.json(
        { error: { code: 'internal', message: 'x' } },
        { status: 500 },
      ),
    })

    await expect(healthService.get()).rejects.toMatchObject({ error: { code: 'internal' } })
  })
})
