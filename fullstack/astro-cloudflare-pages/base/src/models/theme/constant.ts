// constant.ts belongs: the theme's storage key and the brand's default choice. public/theme-init.js
// reads the same key before paint; tests/unit/theme.test.ts keeps the two in step.
import type { ThemeChoice } from './type'

export const THEME_KEY = 'theme'

// The brand's default theme, filled in when the project is generated. Anything but light, dark or
// system reads as system (services/theme.ts).
export const DEFAULT_THEME: string = '__THEME_DEFAULT__'

export const THEME_CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'system']
