import { TestBed } from '@angular/core/testing'

import { provideTestTranslator } from '../i18n/translator.testing'
import { NotificationService } from './notification.service'

describe('NotificationService', () => {
  let notifications: NotificationService

  beforeEach(() => {
    vi.useFakeTimers()
    TestBed.configureTestingModule({ providers: [provideTestTranslator()] })
    notifications = TestBed.inject(NotificationService)
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    vi.useRealTimers()
  })

  it('queues a toast per kind and returns its id', () => {
    const ids = [
      notifications.showSuccess('errors.title'),
      notifications.showError('errors.title'),
      notifications.showInfo('errors.title'),
      notifications.showWarning('errors.title'),
    ]
    expect(new Set(ids).size).toBe(4)
    expect(notifications.toasts().map((toast) => toast.kind)).toEqual([
      'success',
      'error',
      'info',
      'warning',
    ])
  })

  it('renders the queue through the toast component on the overlay', () => {
    notifications.showSuccess('auth.otp.description', { email: 'ada@example.com' })
    notifications.showError('errors.unexpected')
    TestBed.tick()
    const container = document.querySelector('.cdk-overlay-container')
    const items = Array.from(container?.querySelectorAll('.toast') ?? [])
    expect(items.map((item) => item.getAttribute('role'))).toEqual(['status', 'alert'])
    expect(items[0]?.textContent).toContain('a six-digit code to ada@example.com')
    expect(container?.querySelector('[aria-live="polite"]')).not.toBeNull()
  })

  it('dismisses by id, from the queue and the overlay', () => {
    const id = notifications.showInfo('errors.title')
    notifications.showInfo('errors.description')
    notifications.dismiss(id)
    TestBed.tick()
    expect(notifications.toasts().length).toBe(1)
    expect(document.querySelectorAll('.cdk-overlay-container .toast').length).toBe(1)
  })

  it('dismisses when the toast close button is pressed', () => {
    notifications.showInfo('errors.title')
    TestBed.tick()
    document.querySelector<HTMLButtonElement>('.cdk-overlay-container .toast button')?.click()
    expect(notifications.toasts().length).toBe(0)
  })

  it('auto-dismisses after the timeout', () => {
    notifications.showSuccess('errors.title')
    expect(notifications.toasts().length).toBe(1)
    vi.advanceTimersByTime(4000)
    expect(notifications.toasts().length).toBe(0)
  })

  it('keeps an error longer than a success', () => {
    notifications.showError('errors.title')
    vi.advanceTimersByTime(4000)
    expect(notifications.toasts().length).toBe(1)
    vi.advanceTimersByTime(4000)
    expect(notifications.toasts().length).toBe(0)
  })

  it('pauses the countdown while the list is held and resumes with the time left', () => {
    notifications.showSuccess('errors.title')
    vi.advanceTimersByTime(3000)
    notifications.hold(true)
    vi.advanceTimersByTime(60000)
    expect(notifications.toasts().length).toBe(1)
    notifications.hold(false)
    vi.advanceTimersByTime(999)
    expect(notifications.toasts().length).toBe(1)
    vi.advanceTimersByTime(1)
    expect(notifications.toasts().length).toBe(0)
  })

  it('holds a toast that arrives while held, and starts it on release', () => {
    notifications.hold(true)
    notifications.showSuccess('errors.title')
    vi.advanceTimersByTime(10000)
    expect(notifications.toasts().length).toBe(1)
    notifications.hold(false)
    vi.advanceTimersByTime(4000)
    expect(notifications.toasts().length).toBe(0)
  })

  it('holds when the pointer enters the overlay list and releases when it leaves', () => {
    notifications.showSuccess('errors.title')
    TestBed.tick()
    const list = document.querySelector('.cdk-overlay-container .toast-list')
    list?.dispatchEvent(new MouseEvent('mouseenter'))
    vi.advanceTimersByTime(10000)
    expect(notifications.toasts().length).toBe(1)
    list?.dispatchEvent(new MouseEvent('mouseleave'))
    vi.advanceTimersByTime(4000)
    expect(notifications.toasts().length).toBe(0)
  })

  it('releases the hold when the focused dismiss button is removed by dismissing', () => {
    notifications.showInfo('errors.title')
    TestBed.tick()
    const button = document.querySelector<HTMLButtonElement>('.cdk-overlay-container .toast button')
    button?.focus()
    button?.click()
    TestBed.tick()
    expect(notifications.toasts().length).toBe(0)
    notifications.showSuccess('errors.description')
    TestBed.tick()
    vi.advanceTimersByTime(4000)
    expect(notifications.toasts().length).toBe(0)
  })

  it('recomputes focus after a dismiss that leaves other toasts', () => {
    notifications.showInfo('errors.title')
    notifications.showSuccess('errors.description')
    TestBed.tick()
    const button = document.querySelector<HTMLButtonElement>('.cdk-overlay-container .toast button')
    button?.focus()
    button?.click()
    TestBed.tick()
    expect(notifications.toasts().length).toBe(1)
    vi.advanceTimersByTime(4000)
    expect(notifications.toasts().length).toBe(0)
  })

  it('keeps a toast with an action until it is dismissed', () => {
    const run = vi.fn()
    const id = notifications.showInfo('errors.title', undefined, { labelKey: 'actions.retry', run })
    vi.advanceTimersByTime(60_000)
    expect(notifications.toasts().map((toast) => toast.action?.labelKey)).toEqual(['actions.retry'])
    notifications.dismiss(id)
    expect(notifications.toasts().length).toBe(0)
  })
})
