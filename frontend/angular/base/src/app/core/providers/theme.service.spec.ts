import { TestBed } from '@angular/core/testing'

import { DEFAULT_THEME } from '../config/constants'
import { ThemeService } from './theme.service'

type Listener = (event: { matches: boolean }) => void

interface FakeMedia {
  listeners: Listener[]
  fire: (matches: boolean) => void
}

function mockMatchMedia(dark: boolean): FakeMedia {
  const fake: FakeMedia = {
    listeners: [],
    fire: (matches) => {
      fake.listeners.forEach((listener) => {
        listener({ matches })
      })
    },
  }
  vi.stubGlobal('matchMedia', () => ({
    matches: dark,
    addEventListener: (_: string, listener: Listener) => {
      fake.listeners.push(listener)
    },
    removeEventListener: (_: string, listener: Listener) => {
      fake.listeners = fake.listeners.filter((item) => item !== listener)
    },
  }))
  return fake
}

function addMetas() {
  for (const media of ['(prefers-color-scheme: light)', '(prefers-color-scheme: dark)']) {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    meta.content = '#000000'
    meta.media = media
    document.head.appendChild(meta)
  }
}

// The generated default (light, dark or system); the unsubstituted placeholder reads as system.
const CONFIGURED_DEFAULT =
  DEFAULT_THEME === 'light' || DEFAULT_THEME === 'dark' ? DEFAULT_THEME : 'system'

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    addMetas()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.remove()
    })
  })

  it('starts at the configured default and resolves it', () => {
    mockMatchMedia(true)
    const theme = TestBed.inject(ThemeService)
    TestBed.tick()
    expect(theme.preference()).toBe(CONFIGURED_DEFAULT)
    const expected = CONFIGURED_DEFAULT === 'system' ? 'dark' : CONFIGURED_DEFAULT
    expect(theme.resolved()).toBe(expected)
    expect(document.documentElement.getAttribute('data-theme')).toBe(expected)
  })

  it('writes data-theme and the theme-color metas, and persists the choice', () => {
    mockMatchMedia(false)
    const theme = TestBed.inject(ThemeService)
    theme.set('dark')
    TestBed.tick()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    const colors = Array.from(document.head.querySelectorAll('meta[name="theme-color"]')).map(
      (meta) => meta.getAttribute('content'),
    )
    expect(colors).toEqual(['#0a0a0a', '#0a0a0a'])
    expect(localStorage.getItem('theme')).toBe('"dark"')
  })

  it('restores a stored choice and ignores a stored junk value', () => {
    mockMatchMedia(false)
    localStorage.setItem('theme', '"light"')
    expect(TestBed.inject(ThemeService).preference()).toBe('light')
    TestBed.resetTestingModule()
    localStorage.setItem('theme', '"purple"')
    expect(TestBed.inject(ThemeService).preference()).toBe(CONFIGURED_DEFAULT)
  })

  it('cycles light, dark, system, light', () => {
    mockMatchMedia(false)
    const theme = TestBed.inject(ThemeService)
    theme.set('light')
    const seen: string[] = []
    for (let i = 0; i < 3; i++) {
      theme.cycle()
      seen.push(theme.preference())
    }
    expect(seen).toEqual(['dark', 'system', 'light'])
  })

  it('follows the OS preference while system, not otherwise', () => {
    const media = mockMatchMedia(false)
    const theme = TestBed.inject(ThemeService)
    theme.set('system')
    expect(theme.resolved()).toBe('light')
    media.fire(true)
    expect(theme.resolved()).toBe('dark')
    theme.set('light')
    media.fire(true)
    expect(theme.resolved()).toBe('light')
  })

  it('works without matchMedia (system reads as light)', () => {
    expect(TestBed.inject(ThemeService).resolved()).toBe('light')
  })
})
