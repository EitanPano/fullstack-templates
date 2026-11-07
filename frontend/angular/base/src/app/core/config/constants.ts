// The localStorage keys the app owns: the theme choice, the language choice, the session hint and
// the dismissed iOS install hint.
export const STORAGE_KEYS = {
  theme: 'theme',
  lang: 'lang',
  session: 'session',
  iosHint: 'ios-install-hint', // @pwa
} as const

// The product name, filled in when the project is generated.
export const DISPLAY_NAME = '__PROJECT_DISPLAY_NAME__'

// The brand's default theme. Anything but light, dark or system reads as system (ThemeService).
export const DEFAULT_THEME: string = '__THEME_DEFAULT__'

// The browser chrome colour per resolved theme (the theme-color meta); keep in step with the
// --background token of the two themes.
export const THEME_COLORS = {
  light: '#ffffff',
  dark: '#0a0a0a',
} as const
