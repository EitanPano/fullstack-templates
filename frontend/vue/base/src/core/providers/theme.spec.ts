import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_THEME } from '@/core/config/constants'

import { applyTheme, readStoredTheme, resolveTheme, toTheme, watchSystemTheme } from './theme'

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

// The generated default; the unsubstituted placeholder reads as system.
const CONFIGURED = DEFAULT_THEME === 'light' || DEFAULT_THEME === 'dark' ? DEFAULT_THEME : 'system'

describe('theme provider', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    for (const media of ['(prefers-color-scheme: light)', '(prefers-color-scheme: dark)']) {
      const meta = document.createElement('meta')
      meta.name = 'theme-color'
      meta.content = '#000000'
      meta.media = media
      document.head.appendChild(meta)
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.remove()
    })
  })

  it('toTheme accepts the three choices and nothing else', () => {
    expect(toTheme('light')).toBe('light')
    expect(toTheme('dark')).toBe('dark')
    expect(toTheme('system')).toBe('system')
    expect(toTheme('sepia')).toBeNull()
    expect(toTheme(null)).toBeNull()
  })

  it('readStoredTheme returns the stored choice, else the brand default', () => {
    expect(readStoredTheme()).toBe(CONFIGURED)

    localStorage.setItem('theme', '"dark"')
    expect(readStoredTheme()).toBe('dark')

    localStorage.setItem('theme', '"sepia"')
    expect(readStoredTheme()).toBe(CONFIGURED)
  })

  it('resolveTheme passes light and dark through and reads the OS for system', () => {
    mockMatchMedia(true)
    expect(resolveTheme('light')).toBe('light')
    expect(resolveTheme('dark')).toBe('dark')
    expect(resolveTheme('system')).toBe('dark')

    mockMatchMedia(false)
    expect(resolveTheme('system')).toBe('light')
  })

  it('applyTheme sets data-theme and the theme-color metas', () => {
    applyTheme('dark')

    expect(document.documentElement.dataset.theme).toBe('dark')
    for (const meta of document.head.querySelectorAll('meta[name="theme-color"]')) {
      expect(meta.getAttribute('content')).toBe('#0a0a0a')
    }

    applyTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('watchSystemTheme reports OS changes until stopped', () => {
    const media = mockMatchMedia(false)
    const seen: boolean[] = []

    const stop = watchSystemTheme((dark) => seen.push(dark))
    media.fire(true)
    stop()
    media.fire(false)

    expect(seen).toEqual([true])
    expect(media.listeners).toHaveLength(0)
  })
})
