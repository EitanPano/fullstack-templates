import { ApplicationInitStatus } from '@angular/core'
import { TestBed } from '@angular/core/testing'

import { LoggerService } from '@app/core/providers/logger.service'
import { AuthStore } from '@app/store/auth.store'

import { SESSION_RESTORE_TIMEOUT_MS, provideSessionInitializer } from './session.initializer'

describe('provideSessionInitializer', () => {
  const restoreSession = vi.fn<() => Promise<void>>()
  const logError = vi.fn<(message: string) => void>()

  beforeEach(() => {
    restoreSession.mockReset()
    logError.mockReset()
    TestBed.configureTestingModule({
      providers: [
        provideSessionInitializer(),
        { provide: AuthStore, useValue: { restoreSession } },
        { provide: LoggerService, useValue: { error: logError } },
      ],
    })
  })

  it('restores the session before the app starts', async () => {
    let finish: () => void = () => undefined
    restoreSession.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve
      }),
    )
    const status = TestBed.inject(ApplicationInitStatus)
    expect(restoreSession).toHaveBeenCalledOnce()
    let done = false
    void status.donePromise.then(() => {
      done = true
    })
    await Promise.resolve()
    expect(done).toBe(false)
    finish()
    await status.donePromise
    expect(done).toBe(true)
  })

  describe('when the API hangs', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('goes on as a visitor after the timeout and logs once', async () => {
      vi.useFakeTimers()
      restoreSession.mockReturnValue(new Promise<void>(() => undefined))
      const status = TestBed.inject(ApplicationInitStatus)
      let done = false
      void status.donePromise.then(() => {
        done = true
      })
      await vi.advanceTimersByTimeAsync(SESSION_RESTORE_TIMEOUT_MS - 1)
      expect(done).toBe(false)
      expect(logError).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      await status.donePromise
      expect(done).toBe(true)
      expect(logError).toHaveBeenCalledOnce()
    })

    it('logs nothing when the restore finishes in time', async () => {
      vi.useFakeTimers()
      restoreSession.mockResolvedValue(undefined)
      await TestBed.inject(ApplicationInitStatus).donePromise
      await vi.advanceTimersByTimeAsync(SESSION_RESTORE_TIMEOUT_MS)
      expect(logError).not.toHaveBeenCalled()
    })
  })
})
