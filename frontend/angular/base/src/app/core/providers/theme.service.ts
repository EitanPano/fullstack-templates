import { DOCUMENT } from '@angular/common'
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core'

import { DEFAULT_THEME, STORAGE_KEYS, THEME_COLORS } from '../config/constants'
import { StorageService } from './storage.service'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const DARK_QUERY = '(prefers-color-scheme: dark)'
const ORDER: readonly ThemePreference[] = ['light', 'dark', 'system']

function isPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

// The theme choice (light, dark or system), persisted, and the theme it resolves to. It writes
// <html data-theme> and the theme-color meta; public/theme-init.js sets the first value before paint.
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT)
  private readonly storage = inject(StorageService)
  private readonly media = this.matchDark()
  private readonly systemDark = signal(this.media?.matches ?? false)

  readonly preference = signal<ThemePreference>(this.initial())
  readonly resolved = computed<ResolvedTheme>(() => {
    const preference = this.preference()
    if (preference === 'system') return this.systemDark() ? 'dark' : 'light'
    return preference
  })

  constructor() {
    const media = this.media
    if (media) {
      const onChange = (event: MediaQueryListEvent) => {
        this.systemDark.set(event.matches)
      }
      media.addEventListener('change', onChange)
      inject(DestroyRef).onDestroy(() => {
        media.removeEventListener('change', onChange)
      })
    }
    effect(() => {
      this.apply(this.resolved())
    })
  }

  set(preference: ThemePreference): void {
    this.preference.set(preference)
    this.storage.set(STORAGE_KEYS.theme, preference)
  }

  // light, then dark, then system, then light again.
  cycle(): void {
    const next = ORDER[(ORDER.indexOf(this.preference()) + 1) % ORDER.length]
    this.set(next)
  }

  private initial(): ThemePreference {
    const stored = this.storage.get(STORAGE_KEYS.theme)
    if (isPreference(stored)) return stored
    return isPreference(DEFAULT_THEME) ? DEFAULT_THEME : 'system'
  }

  private matchDark(): MediaQueryList | null {
    const win = this.document.defaultView
    return win && typeof win.matchMedia === 'function' ? win.matchMedia(DARK_QUERY) : null
  }

  private apply(theme: ResolvedTheme): void {
    this.document.documentElement.setAttribute('data-theme', theme)
    for (const meta of Array.from(
      this.document.head.querySelectorAll('meta[name="theme-color"]'),
    )) {
      meta.setAttribute('content', THEME_COLORS[theme])
    }
  }
}
