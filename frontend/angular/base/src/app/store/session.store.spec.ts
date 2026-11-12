import { TestBed } from '@angular/core/testing'

import { STORAGE_KEYS } from '@app/core/config/constants'
import { LoggerService } from '@app/core/providers/logger.service'
import { StorageService } from '@app/core/providers/storage.service'
import { ApiError } from '@app/services/api-error'
import { AuthService } from '@app/services/auth.service'

import { SessionStore } from './session.store'

const api = (status: number, code: ApiError['code']) => new ApiError({ status, code })

describe('SessionStore', () => {
  const auth = { refresh: vi.fn() }
  const logError = vi.fn<(message: string, ...details: unknown[]) => void>()

  const hint = () => TestBed.inject(StorageService).get(STORAGE_KEYS.session)
  const setHint = () => TestBed.inject(StorageService).set(STORAGE_KEYS.session, '1')

  beforeEach(() => {
    localStorage.clear()
    auth.refresh.mockReset()
    logError.mockClear()
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: LoggerService, useValue: { error: logError } },
      ],
    })
  })

  it('reads the hint once at start', () => {
    setHint()
    expect(TestBed.inject(SessionStore).active()).toBe(true)
  })

  it('starts and ends the session in step with the hint', () => {
    const session = TestBed.inject(SessionStore)
    expect(session.active()).toBe(false)
    session.start()
    expect([session.active(), hint()]).toEqual([true, '1'])
    session.end()
    expect([session.active(), hint()]).toEqual([false, null])
  })

  it('renews: the hint stays', async () => {
    auth.refresh.mockResolvedValue({})
    setHint()
    const session = TestBed.inject(SessionStore)
    expect(await session.refresh()).toBe('renewed')
    expect(session.active()).toBe(true)
  })

  it.each([400, 401, 403])(
    'a %i is a refusal: the session ends, nothing logged',
    async (status) => {
      auth.refresh.mockRejectedValue(api(status, 'unauthenticated'))
      setHint()
      const session = TestBed.inject(SessionStore)
      expect(await session.refresh()).toBe('refused')
      expect([session.active(), hint()]).toEqual([false, null])
      expect(logError).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['a 500', api(500, 'internal')],
    ['a rate limit', api(429, 'rate_limited')],
    ['no response', api(0, 'network')],
    ['a bug', new TypeError('boom')],
  ])('%s says nothing about the cookies: failed, logged, hint kept', async (_what, error) => {
    auth.refresh.mockRejectedValue(error)
    setHint()
    const session = TestBed.inject(SessionStore)
    expect(await session.refresh()).toBe('failed')
    expect(session.active()).toBe(true)
    expect(logError).toHaveBeenCalledTimes(1)
  })

  it('shares one in-flight refresh between concurrent callers', async () => {
    let finish: () => void = () => undefined
    auth.refresh.mockReturnValue(
      new Promise((resolve) => {
        finish = () => {
          resolve({})
        }
      }),
    )
    const session = TestBed.inject(SessionStore)
    const results = [session.refresh(), session.refresh(), session.refresh()]
    finish()
    expect(await Promise.all(results)).toEqual(['renewed', 'renewed', 'renewed'])
    expect(auth.refresh).toHaveBeenCalledTimes(1)
    auth.refresh.mockResolvedValue({})
    await session.refresh()
    expect(auth.refresh).toHaveBeenCalledTimes(2)
  })
})
