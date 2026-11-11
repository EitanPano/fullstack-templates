// Paths the guards and the API client redirect to, and the one table of localStorage keys, so // @server
// Paths the guards redirect to, and the one table of localStorage keys, so // @noserver
// no file spells a key twice. The theme key is also read by public/theme-init.js before paint.
export const LOGIN_PATH = '/auth/login' // @server:auth
export const FORBIDDEN_PATH = '/forbidden' // @server:auth

export const STORAGE_KEYS = {
  theme: 'theme',
  lang: 'lang', // @i18n
  iosHint: 'ios-hint', // @pwa
  sessionHint: 'session-hint', // @server:auth
} as const

// The product name, filled in when the project is generated.
export const DISPLAY_NAME = '__PROJECT_DISPLAY_NAME__'

// The brand's default theme. Anything but light, dark or system reads as system (providers/theme.ts).
export const DEFAULT_THEME: string = '__THEME_DEFAULT__'

// The browser chrome colour per resolved theme (the theme-color meta); keep in step with the
// --background token of the two themes.
export const THEME_COLORS = {
  light: '#ffffff',
  dark: '#0a0a0a',
} as const
