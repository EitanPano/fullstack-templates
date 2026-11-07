import { TestBed } from '@angular/core/testing'
import { SwUpdate, type VersionEvent } from '@angular/service-worker'
import { Subject } from 'rxjs'

import { AppUpdateService, RELOAD_PAGE } from './app-update.service'
import { LoggerService } from './logger.service'
import { NotificationService } from './notification.service'

interface Action {
  labelKey: string
  run: () => void
}

function setup(isEnabled = true) {
  const versions = new Subject<VersionEvent>()
  const unrecoverable = new Subject<unknown>()
  const sw = {
    isEnabled,
    versionUpdates: versions,
    unrecoverable,
    checkForUpdate: vi.fn(() => Promise.resolve(false)),
    activateUpdate: vi.fn(() => Promise.resolve(true)),
  }
  const notifications = { showInfo: vi.fn(), showWarning: vi.fn() }
  const logger = { error: vi.fn() }
  const reload = vi.fn()
  TestBed.configureTestingModule({
    providers: [
      { provide: SwUpdate, useValue: sw },
      { provide: NotificationService, useValue: notifications },
      { provide: LoggerService, useValue: logger },
      { provide: RELOAD_PAGE, useValue: reload },
    ],
  })
  const service = TestBed.inject(AppUpdateService)
  return { service, versions, unrecoverable, sw, notifications, logger, reload }
}

const READY = {
  type: 'VERSION_READY',
  currentVersion: { hash: 'a' },
  latestVersion: { hash: 'b' },
} as VersionEvent

describe('AppUpdateService', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows one toast when a version is ready; its action activates the update and reloads', async () => {
    const { service, versions, sw, notifications, reload } = setup()
    service.start()
    versions.next(READY)
    expect(notifications.showInfo).toHaveBeenCalledTimes(1)
    const [key, , action] = notifications.showInfo.mock.calls[0] as [string, unknown, Action]
    expect(key).toBe('pwa.updateReady')
    expect(action.labelKey).toBe('pwa.reload')
    action.run()
    await vi.waitFor(() => {
      expect(reload).toHaveBeenCalledOnce()
    })
    expect(sw.activateUpdate).toHaveBeenCalledOnce()
  })

  it('logs a failed activation and does not reload', async () => {
    const { service, versions, sw, notifications, reload, logger } = setup()
    sw.activateUpdate.mockRejectedValueOnce(new Error('no'))
    service.start()
    versions.next(READY)
    const [, , action] = notifications.showInfo.mock.calls[0] as [string, unknown, Action]
    action.run()
    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledOnce()
    })
    expect(reload).not.toHaveBeenCalled()
  })

  it('logs a failed installation and shows no toast', () => {
    const { service, versions, notifications, logger } = setup()
    service.start()
    versions.next({
      type: 'VERSION_INSTALLATION_FAILED',
      version: { hash: 'b' },
      error: 'boom',
    })
    expect(logger.error).toHaveBeenCalledOnce()
    expect(notifications.showInfo).not.toHaveBeenCalled()
  })

  it('subscribes to nothing and checks for nothing when the service worker is disabled', () => {
    const { service, versions, sw, notifications } = setup(false)
    service.start()
    expect(versions.observed).toBe(false)
    versions.next(READY)
    expect(notifications.showInfo).not.toHaveBeenCalled()
    expect(sw.checkForUpdate).not.toHaveBeenCalled()
  })

  it('asks to reload when the service worker reports an unrecoverable state', () => {
    const { service, unrecoverable, notifications, reload } = setup()
    service.start()
    unrecoverable.next({ reason: 'x' })
    expect(notifications.showWarning).toHaveBeenCalledOnce()
    const [key, , action] = notifications.showWarning.mock.calls[0] as [string, unknown, Action]
    expect(key).toBe('pwa.unrecoverable')
    action.run()
    expect(reload).toHaveBeenCalledOnce()
  })

  it('checks at start, when stable every hour, and on focus at most every five minutes', async () => {
    vi.useFakeTimers()
    const { service, sw } = setup()
    service.start()
    expect(sw.checkForUpdate).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(sw.checkForUpdate).toHaveBeenCalledTimes(2)
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('focus'))
    expect(sw.checkForUpdate).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    window.dispatchEvent(new Event('focus'))
    expect(sw.checkForUpdate).toHaveBeenCalledTimes(4)
  })

  it('logs a failed check instead of throwing', async () => {
    const { service, sw, logger } = setup()
    sw.checkForUpdate.mockRejectedValue(new Error('offline'))
    service.start()
    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledOnce()
    })
  })
})
