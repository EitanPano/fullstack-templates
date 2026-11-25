// The theme travels in the frame's address (first paint) and again over the channel. The frame
// writes it into the document through the CSSOM, so a value is checked here against a short
// pattern: nothing the host passes can add a rule or close a declaration.
export type Theme = {
  scheme?: 'light' | 'dark'
  text?: string
  accent?: string
  radius?: string
  font?: string
}

const COLOR = /^#[0-9a-fA-F]{3,8}$/
const RADIUS = /^\d{1,3}(px|rem)$/
const FONT = /^[A-Za-z0-9 ,'"-]{1,120}$/

const KEYS = ['text', 'accent', 'radius', 'font'] as const
const PATTERN = { text: COLOR, accent: COLOR, radius: RADIUS, font: FONT } as const

export function parseTheme(data: Record<string, unknown>): Theme {
  const theme: Theme = {}
  if (data.scheme === 'light' || data.scheme === 'dark') theme.scheme = data.scheme
  for (const key of KEYS) {
    const value = data[key]
    if (typeof value === 'string' && PATTERN[key].test(value)) theme[key] = value
  }
  return theme
}

export function themeToParams(theme: Theme): URLSearchParams {
  const params = new URLSearchParams()
  if (theme.scheme) params.set('scheme', theme.scheme)
  for (const key of KEYS) {
    const value = theme[key]
    if (value) params.set(key, value)
  }
  return params
}

export function themeFromParams(params: URLSearchParams): Theme {
  return parseTheme(Object.fromEntries(params))
}
