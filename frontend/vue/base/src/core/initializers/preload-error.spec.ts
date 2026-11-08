import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installPreloadReload, PRELOAD_RELOAD_KEY, PRELOAD_RELOAD_WINDOW_MS } from './preload-error'

function setup() {
  const target = new EventTarget()
  const reload = vi.fn()
  installPreloadReload(target, reload)
  const fire = () => {
    const event = new Event('vite:preloadError', { cancelable: true })
    target.dispatchEvent(event)
    return event
  }
  return { fire, reload }
}

describe('installPreloadReload', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reloads on the first event and stamps the time', () => {
    const { fire, reload } = setup()

    const event = fire()

    expect(reload).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
    expect(sessionStorage.getItem(PRELOAD_RELOAD_KEY)).toBe(String(Date.now()))
  })

  it('does not reload again inside the window and lets the error surface', () => {
    const { fire, reload } = setup()
    fire()
    vi.advanceTimersByTime(PRELOAD_RELOAD_WINDOW_MS - 1)

    const event = fire()

    expect(reload).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(false)
  })

  it('reloads again once the window has passed', () => {
    const { fire, reload } = setup()
    fire()
    vi.advanceTimersByTime(PRELOAD_RELOAD_WINDOW_MS + 1)

    fire()

    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('still reloads when sessionStorage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { fire, reload } = setup()

    fire()

    expect(reload).toHaveBeenCalledOnce()
    vi.restoreAllMocks()
  })
})
