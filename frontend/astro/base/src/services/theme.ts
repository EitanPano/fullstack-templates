// theme.ts belongs: the theme choice (light, dark, system), where it is stored and what it resolves
// to. public/theme-init.js applies the stored value before paint; the theme toggle uses these
// functions to change it. It does not belong: the toggle's markup (components/ui/theme-toggle).
import { DEFAULT_THEME, THEME_KEY } from '../models/theme/constant'
import type { ResolvedTheme, ThemeChoice } from '../models/theme/type'

export function toTheme(value: unknown): ThemeChoice | null {
  return value === 'light' || value === 'dark' || value === 'system' ? value : null
}

const ORDER: Record<ThemeChoice, ThemeChoice> = { light: 'dark', dark: 'system', system: 'light' }
export const nextTheme = (choice: ThemeChoice): ThemeChoice => ORDER[choice]

// The stored choice, else the brand's default, else system. Blocked storage reads as unset.
export function readTheme(
  storage: Pick<Storage, 'getItem'>,
  fallback: string = DEFAULT_THEME,
): ThemeChoice {
  let stored: string | null = null
  try {
    stored = storage.getItem(THEME_KEY)
  } catch {
    // Blocked storage: the default applies.
  }
  return toTheme(stored) ?? toTheme(fallback) ?? 'system'
}

export function writeTheme(storage: Pick<Storage, 'setItem'>, choice: ThemeChoice): void {
  try {
    storage.setItem(THEME_KEY, choice)
  } catch {
    // Blocked storage: the choice lasts until the page closes.
  }
}

export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): ResolvedTheme {
  if (choice !== 'system') return choice
  return prefersDark ? 'dark' : 'light'
}

// Writes <html data-theme>; the first value is set before paint by public/theme-init.js.
export function applyTheme(root: HTMLElement, choice: ThemeChoice, prefersDark: boolean): void {
  root.dataset.theme = resolveTheme(choice, prefersDark)
}
