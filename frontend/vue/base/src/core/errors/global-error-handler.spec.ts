import { createApp } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installGlobalErrorHandler } from './global-error-handler'

describe('installGlobalErrorHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function setup() {
    const app = createApp({ render: () => null })
    const notify = vi.fn()
    const uninstall = installGlobalErrorHandler(app, notify)
    return { app, notify, uninstall }
  }

  it('logs an error a component threw and notifies once', () => {
    const { app, notify } = setup()

    app.config.errorHandler?.(new Error('boom'), null, 'setup function')

    expect(console.error).toHaveBeenCalledWith(
      'Unhandled error',
      expect.anything(),
      'setup function',
    )
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('logs an unhandled promise rejection and notifies', () => {
    const { notify } = setup()
    const event = Object.assign(new Event('unhandledrejection'), { reason: new Error('late') })

    window.dispatchEvent(event)

    expect(console.error).toHaveBeenCalled()
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('collapses a burst of failures into one toast, then notifies again later', () => {
    const { app, notify } = setup()

    app.config.errorHandler?.(new Error('a'), null, 'render')
    app.config.errorHandler?.(new Error('b'), null, 'render')
    expect(notify).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(5000)
    app.config.errorHandler?.(new Error('c'), null, 'render')
    expect(notify).toHaveBeenCalledTimes(2)
  })

  it('never puts the error text in the notification', () => {
    const { app, notify } = setup()

    app.config.errorHandler?.(new Error('secret detail'), null, 'render')

    expect(notify).toHaveBeenCalledWith()
  })

  it('stops listening to rejections once uninstalled', () => {
    const { notify, uninstall } = setup()

    uninstall()
    window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: 'x' }))

    expect(notify).not.toHaveBeenCalled()
  })
})
