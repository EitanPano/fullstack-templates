import { STORAGE_KEYS } from '@/core/config/constants'
import { readItem, writeItem } from '@/shared/utils/storage'

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const DARK_QUERY = '(prefers-color-scheme: dark)'

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system'
}

// The brand's default arrives as a string from the generator; anything unknown reads as `system`.
export function toTheme(value: string): Theme {
  return isTheme(value) ? value : 'system'
}

export function readStoredTheme(fallback: Theme): Theme {
  const stored = readItem(STORAGE_KEYS.theme)
  return isTheme(stored) ? stored : fallback
}

export function resolveTheme(choice: Theme): ResolvedTheme {
  if (choice !== 'system') return choice
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

// `data-theme` on <html> always holds the resolved value, never `system`; public/theme-init.js
// sets it before first paint and this keeps it in step. The choice itself is what is stored,
// and only when the visitor made it (`persist`).
export function applyTheme(choice: Theme, { persist = true }: { persist?: boolean } = {}): void {
  document.documentElement.dataset.theme = resolveTheme(choice)
  if (persist) writeItem(STORAGE_KEYS.theme, choice)
}

// Calls `onChange` when the OS preference flips; the returned function stops listening.
export function watchSystemTheme(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY)
  media.addEventListener('change', onChange)
  return () => {
    media.removeEventListener('change', onChange)
  }
}
