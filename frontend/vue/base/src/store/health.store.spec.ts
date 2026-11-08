import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { installInterceptors } from '@/core/interceptors/http.provider'
import { healthService } from '@/services/health.service'
import { stubApi } from '@/testing/stub-api'

import { useHealthStore } from './health.store'
import { useNotificationStore } from './notification.store'

const HEALTH = { status: 'ok', uptimeSeconds: 90, version: '1.0.0' } as const

describe('useHealthStore', () => {
  beforeAll(() => {
    installInterceptors()
  })

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts idle with nothing loaded', () => {
    const store = useHealthStore()

    expect(store.status).toBe('idle')
    expect(store.health).toBeNull()
    expect(store.checkedAt).toBeNull()
    expect(store.error).toBeNull()
  })

  it('goes idle, loading, loaded and keeps the answer and when it came', async () => {
    stubApi({ 'GET /api/health': Response.json(HEALTH) })
    const store = useHealthStore()

    const pending = store.load()
    expect(store.status).toBe('loading')
    expect(store.loading).toBe(true)
    await pending

    expect(store.status).toBe('loaded')
    expect(store.loaded).toBe(true)
    expect(store.health).toEqual(HEALTH)
    expect(store.checkedAt).not.toBeNull()
    expect(useNotificationStore().toasts).toEqual([])
  })

  it('keeps the ApiError, toasts its copy key once and leaves the old answer alone', async () => {
    stubApi({ 'GET /api/health': Response.json(HEALTH) })
    const store = useHealthStore()
    await store.load()

    stubApi({
      'GET /api/health': Response.json(
        { error: { code: 'internal', message: 'select * from secret' }, requestId: 'r-1' },
        { status: 500 },
      ),
    })
    await store.load()

    expect(store.status).toBe('error')
    expect(store.failed).toBe(true)
    expect(store.error).toEqual({ code: 'internal', status: 500, requestId: 'r-1' })
    expect(store.health).toEqual(HEALTH)
    expect(useNotificationStore().toasts.map((toast) => toast.messageKey)).toEqual([
      'errors.internal',
    ])
  })

  it('shows a lost connection as the network copy', async () => {
    stubApi({
      'GET /api/health': () => {
        throw new TypeError('Failed to fetch')
      },
    })
    const store = useHealthStore()

    await store.load()

    expect(store.error).toEqual({ code: 'network' })
    expect(useNotificationStore().toasts.map((toast) => toast.messageKey)).toEqual([
      'errors.network',
    ])
  })

  it('logs a cause that is not an ApiError and shows errors.unknown', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(healthService, 'get').mockRejectedValue(new Error('bug in the facade'))
    const store = useHealthStore()

    await store.load()

    expect(logged).toHaveBeenCalled()
    expect(store.error).toEqual({ code: 'unknown', context: 'health.load' })
    expect(useNotificationStore().toasts.map((toast) => toast.messageKey)).toEqual([
      'errors.unknown',
    ])
  })

  it('clears the error when the next load starts', async () => {
    stubApi({})
    const store = useHealthStore()
    await store.load()
    expect(store.failed).toBe(true)

    stubApi({ 'GET /api/health': Response.json(HEALTH) })
    const pending = store.load()
    expect(store.error).toBeNull()
    await pending

    expect(store.loaded).toBe(true)
  })
})
