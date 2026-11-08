import { DEFAULT_THEME, STORAGE_KEYS, THEME_COLORS } from '@/core/config/constants'
import { storage } from '@/core/providers/storage'

export type ThemeChoice = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const DARK_QUERY = '(prefers-color-scheme: dark)'

// The choice a value names, or null for anything else.
export function toTheme(value: unknown): ThemeChoice | null {
  return value === 'light' || value === 'dark' || value === 'system' ? value : null
}

// The saved choice, else the brand's default, else system. public/theme-init.js reads the same.
export function readStoredTheme(): ThemeChoice {
  return toTheme(storage.get(STORAGE_KEYS.theme)) ?? toTheme(DEFAULT_THEME) ?? 'system'
}

function darkQuery(): MediaQueryList | null {
  return typeof matchMedia === 'function' ? matchMedia(DARK_QUERY) : null
}

// system follows the OS; light and dark are themselves.
export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice !== 'system') return choice
  return darkQuery()?.matches ? 'dark' : 'light'
}

// Writes <html data-theme> and the theme-color metas; the first value is set before paint by
// public/theme-init.js.
export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.setAttribute('data-theme', theme)
  for (const meta of document.head.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', THEME_COLORS[theme])
  }
}

// Calls `listener(dark)` whenever the OS preference changes; the returned function stops it.
export function watchSystemTheme(listener: (dark: boolean) => void): () => void {
  const media = darkQuery()
  if (!media) return () => undefined
  const onChange = (event: MediaQueryListEvent) => {
    listener(event.matches)
  }
  media.addEventListener('change', onChange)
  return () => {
    media.removeEventListener('change', onChange)
  }
}
