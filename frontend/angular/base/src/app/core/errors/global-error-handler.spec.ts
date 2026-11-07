import { ErrorHandler } from '@angular/core'
import { TestBed } from '@angular/core/testing'

import { provideTestTranslator } from '../i18n/translator.testing'
import { LoggerService } from '../providers/logger.service'
import { NotificationService } from '../providers/notification.service'
import { GlobalErrorHandler } from './global-error-handler'

describe('GlobalErrorHandler', () => {
  let handler: ErrorHandler
  let notifications: NotificationService
  const error = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    error.mockClear()
    TestBed.configureTestingModule({
      providers: [
        provideTestTranslator(),
        { provide: ErrorHandler, useClass: GlobalErrorHandler },
        { provide: LoggerService, useValue: { error, warn: vi.fn() } },
      ],
    })
    handler = TestBed.inject(ErrorHandler)
    notifications = TestBed.inject(NotificationService)
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    vi.useRealTimers()
  })

  it('logs the error and shows the unexpected toast', () => {
    const failure = new Error('boom')
    handler.handleError(failure)
    expect(error).toHaveBeenCalledWith('Unhandled error', failure)
    expect(notifications.toasts().map((toast) => toast.messageKey)).toEqual(['errors.unexpected'])
    expect(notifications.toasts()[0]?.kind).toBe('error')
  })

  it('shows one toast however many errors follow', () => {
    handler.handleError(new Error('a'))
    handler.handleError(new Error('b'))
    expect(notifications.toasts().length).toBe(1)
    expect(error).toHaveBeenCalledTimes(2)
  })
})
