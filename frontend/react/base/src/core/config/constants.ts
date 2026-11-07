// Paths the guards and the API client redirect to, and the one table of localStorage keys, so
// no file spells a key twice. The theme key is also read by public/theme-init.js before paint.
export const SIGN_IN_PATH = '/sign-in' // @server:auth
export const FORBIDDEN_PATH = '/forbidden' // @server:auth

export const STORAGE_KEYS = {
  theme: 'theme',
  sessionHint: 'session-hint', // @server:auth
} as const
