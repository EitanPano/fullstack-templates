import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createStore } from '@/store'
import { selectTheme, themeChanged, themeRestored } from '@/store/theme.slice'

// A matchMedia whose answer a test sets, and whose change listeners it can fire.
function mockOs(dark: boolean) {
  const listeners = new Set<() => void>()
  const state = { dark }
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    get matches() {
      return state.dark && query.includes('dark')
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }))
  return {
    listeners,
    flip(next: boolean) {
      state.dark = next
      listeners.forEach((listener) => {
        listener()
      })
    },
  }
}

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('the theme slice and its listener', () => {
  it('starts as system', () => {
    expect(selectTheme(createStore().getState())).toBe('system')
  })

  it('writes the resolved choice to data-theme and persists it', () => {
    const store = createStore()

    store.dispatch(themeChanged('dark'))

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(selectTheme(store.getState())).toBe('dark')
  })

  it('applies a restored choice at boot without writing storage', () => {
    const store = createStore()

    store.dispatch(themeRestored('dark'))

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(selectTheme(store.getState())).toBe('dark')
    expect(localStorage.getItem('theme')).toBeNull()
  })

  it('writes storage when the user changes the theme after boot', () => {
    const store = createStore()
    store.dispatch(themeRestored('light'))

    store.dispatch(themeChanged('dark'))

    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('resolves system through matchMedia and never writes system to the page', () => {
    mockOs(true)
    const store = createStore()

    store.dispatch(themeChanged('system'))

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('system')
  })

  it('follows the OS while the choice is system, and stops when it is not', () => {
    const os = mockOs(false)
    const store = createStore()

    store.dispatch(themeChanged('system'))
    expect(document.documentElement.dataset.theme).toBe('light')
    os.flip(true)
    expect(document.documentElement.dataset.theme).toBe('dark')

    store.dispatch(themeChanged('light'))
    expect(os.listeners.size).toBe(0)
    os.flip(false)
    os.flip(true)
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('keeps one OS watcher however often system is chosen', () => {
    const os = mockOs(false)
    const store = createStore()

    store.dispatch(themeChanged('system'))
    store.dispatch(themeChanged('system'))

    expect(os.listeners.size).toBe(1)
  })

  it('does not throw when storage is blocked, and still applies the theme', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    const store = createStore()

    expect(() => store.dispatch(themeChanged('dark'))).not.toThrow()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
