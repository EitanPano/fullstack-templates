import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_THEME } from '@/core/config/constants'

import { useThemeStore } from './theme.store'

type Listener = (event: { matches: boolean }) => void

function mockMatchMedia(dark: boolean) {
  const listeners: Listener[] = []
  vi.stubGlobal('matchMedia', () => ({
    matches: dark,
    addEventListener: (_: string, listener: Listener) => listeners.push(listener),
    removeEventListener: (_: string, listener: Listener) => {
      listeners.splice(listeners.indexOf(listener), 1)
    },
  }))
  return {
    listeners,
    fire: (matches: boolean) => {
      for (const listener of [...listeners]) listener({ matches })
    },
  }
}

const CONFIGURED = DEFAULT_THEME === 'light' || DEFAULT_THEME === 'dark' ? DEFAULT_THEME : 'system'

describe('theme store', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts from the saved choice and applies the resolved theme at once', () => {
    mockMatchMedia(false)
    localStorage.setItem('theme', '"dark"')

    const store = useThemeStore()

    expect(store.choice).toBe('dark')
    expect(store.resolved).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('starts from the brand default when nothing is saved', () => {
    mockMatchMedia(false)

    expect(useThemeStore().choice).toBe(CONFIGURED)
  })

  it('persists a choice and re-applies the theme', async () => {
    mockMatchMedia(false)
    const store = useThemeStore()

    store.set('dark')
    await nextTick()

    expect(localStorage.getItem('theme')).toBe('"dark"')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('cycles light, dark, system, light', () => {
    mockMatchMedia(false)
    const store = useThemeStore()
    store.set('light')

    const seen = [1, 2, 3].map(() => {
      store.cycle()
      return store.choice
    })

    expect(seen).toEqual(['dark', 'system', 'light'])
  })

  it('follows the OS while the choice is system, and not otherwise', async () => {
    const media = mockMatchMedia(false)
    const store = useThemeStore()
    store.set('system')
    await nextTick()
    expect(store.resolved).toBe('light')

    media.fire(true)
    await nextTick()
    expect(store.resolved).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')

    store.set('light')
    media.fire(true)
    await nextTick()
    expect(store.resolved).toBe('light')
  })

  it('stops watching the OS when the store is disposed', () => {
    const media = mockMatchMedia(false)
    const store = useThemeStore()

    store.$dispose()

    expect(media.listeners).toHaveLength(0)
  })
})
