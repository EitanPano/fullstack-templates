import { TestBed } from '@angular/core/testing'

import { LoggerService } from '@app/core/providers/logger.service'
import { NotificationService } from '@app/core/providers/notification.service'
import { ApiError } from '@app/models/api/response'
import { HealthService } from '@app/services/health.service'

import { HealthStore } from './health.store'

const HEALTH = { status: 'ok', uptimeSeconds: 5, version: '1.0.0' } as const

describe('HealthStore', () => {
  const get = vi.fn<() => Promise<typeof HEALTH>>()
  const showError = vi.fn<(key: string) => number>(() => 1)

  const logError = vi.fn<(message: string, ...details: unknown[]) => void>()

  beforeEach(() => {
    logError.mockClear()
    get.mockReset()
    showError.mockClear()
    TestBed.configureTestingModule({
      providers: [
        { provide: HealthService, useValue: { get } },
        { provide: NotificationService, useValue: { showError } },
        { provide: LoggerService, useValue: { error: logError } },
      ],
    })
  })

  it('loads the health and stamps when it was checked', async () => {
    get.mockResolvedValue(HEALTH)
    const store = TestBed.inject(HealthStore)
    const pending = store.load()
    expect(store.loading()).toBe(true)
    await pending
    expect(store.loaded()).toBe(true)
    expect(store.health()).toEqual(HEALTH)
    expect(Number.isNaN(Date.parse(store.checkedAt() ?? ''))).toBe(false)
    expect(showError).not.toHaveBeenCalled()
  })

  it('records an ApiError and toasts its mapped key once', async () => {
    get.mockRejectedValue(new ApiError({ status: 503, code: 'upstream_unavailable' }))
    const store = TestBed.inject(HealthStore)
    await store.load()
    expect(store.failed()).toBe(true)
    expect(store.error()).toMatchObject({ code: 'upstream_unavailable' })
    expect(showError).toHaveBeenCalledTimes(1)
    expect(showError).toHaveBeenCalledWith('errors.upstream_unavailable')
    expect(logError).not.toHaveBeenCalled()
  })

  it('falls back to errors.unknown for anything that is not an ApiError', async () => {
    get.mockRejectedValue(new TypeError('boom'))
    const store = TestBed.inject(HealthStore)
    await store.load()
    expect(store.error()).toMatchObject({ code: 'unknown' })
    expect(showError).toHaveBeenCalledWith('errors.unknown')
    expect(logError).toHaveBeenCalledTimes(1)
    expect(logError.mock.calls[0]?.[1]).toBeInstanceOf(TypeError)
  })

  it('keeps the earlier health while a refresh fails', async () => {
    get.mockResolvedValueOnce(HEALTH)
    const store = TestBed.inject(HealthStore)
    await store.load()
    get.mockRejectedValueOnce(new ApiError({ status: 0, code: 'network' }))
    await store.load()
    expect(store.health()).toEqual(HEALTH)
    expect(store.failed()).toBe(true)
  })
})
