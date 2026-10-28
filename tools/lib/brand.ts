import { buildTheme, formatOklch, hexToOklch, oklchToHex, renderTokens } from './theme'

// The brand inputs of a frontend: the CLI options and answers.brand carry these names.
export interface BrandInput {
  displayName?: string
  primary?: string
  neutral?: string
  radius?: string
  font?: string
  theme?: string
  density?: string
}

export const RADII = ['sm', 'md', 'lg'] as const
export const FONTS = ['system', 'inter'] as const
export const THEMES = ['system', 'light', 'dark'] as const
export const DENSITIES = ['comfortable', 'compact'] as const

export interface Brand {
  displayName: string
  primary: string
  neutral: string
  radius: (typeof RADII)[number]
  font: (typeof FONTS)[number]
  theme: (typeof THEMES)[number]
  density: (typeof DENSITIES)[number]
}

// Today's blue as the primary on a slate neutral.
export const BRAND_DEFAULTS = {
  primary: '#1d4ed8',
  neutral: '#64748b',
  radius: 'md',
  font: 'system',
  theme: 'system',
  density: 'comfortable',
} as const satisfies Omit<Brand, 'displayName'>

export const BRAND_KEYS: readonly (keyof BrandInput)[] = [
  'displayName',
  'primary',
  'neutral',
  'radius',
  'font',
  'theme',
  'density',
]

const OPTION: Record<keyof BrandInput, string> = {
  displayName: '--display-name',
  primary: '--brand-primary',
  neutral: '--brand-neutral',
  radius: '--radius',
  font: '--font',
  theme: '--theme',
  density: '--density',
}

export class BrandError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BrandError'
  }
}

// The name is substituted verbatim into JSON, TS/TSX string literals and JSX or HTML text, so it
// may hold no quote, backslash, angle bracket, ampersand, brace, backtick or dollar sign. `:` is
// allowed because those contexts take it; a template that puts the name in YAML must quote it.
// Two underscores in a row are refused separately (see resolveBrand).
const DISPLAY_NAME = /^[\p{L}\p{N}][\p{L}\p{N} .,:!?_-]*$/u
const MAX_DISPLAY_NAME = 60

// The project name in title case, cut at a word boundary when it is longer than the limit.
function titleCase(projectName: string): string {
  const words = projectName
    .split('-')
    .filter((word) => word !== '')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  let name = words.join(' ')
  while (name.length > MAX_DISPLAY_NAME && words.length > 1) {
    words.pop()
    name = words.join(' ')
  }
  return name.slice(0, MAX_DISPLAY_NAME)
}

function oneOf<T extends string>(key: keyof BrandInput, value: string, allowed: readonly T[]): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new BrandError(`${OPTION[key]} must be ${allowed.join(', ')}, got "${value}"`)
  }
  return value as T
}

// Six lowercase digits; the colour maths proves the value parses.
function normalHex(key: 'primary' | 'neutral', value: string): string {
  try {
    hexToOklch(value)
  } catch (error) {
    throw new BrandError(`${OPTION[key]}: ${(error as Error).message}`)
  }
  const digits = value.slice(1).toLowerCase()
  const full = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits
  return `#${full}`
}

export function resolveBrand(input: BrandInput, projectName: string): Brand {
  const displayName = input.displayName ?? titleCase(projectName)
  // __WORD__ would be read as a generator placeholder and fail late, in the placeholder sweep.
  if (displayName.includes('__')) {
    throw new BrandError(
      `${OPTION.displayName} must not contain two underscores in a row (they read as a placeholder), got "${displayName}"`,
    )
  }
  if (
    displayName.length === 0 ||
    displayName.length > MAX_DISPLAY_NAME ||
    !DISPLAY_NAME.test(displayName)
  ) {
    throw new BrandError(
      `${OPTION.displayName} must be 1 to ${String(MAX_DISPLAY_NAME)} characters of letters, digits, ` +
        `spaces and . , : ! ? _ -, starting with a letter or digit, got "${displayName}"`,
    )
  }
  return {
    displayName,
    primary: normalHex('primary', input.primary ?? BRAND_DEFAULTS.primary),
    neutral: normalHex('neutral', input.neutral ?? BRAND_DEFAULTS.neutral),
    radius: oneOf('radius', input.radius ?? BRAND_DEFAULTS.radius, RADII),
    font: oneOf('font', input.font ?? BRAND_DEFAULTS.font, FONTS),
    theme: oneOf('theme', input.theme ?? BRAND_DEFAULTS.theme, THEMES),
    density: oneOf('density', input.density ?? BRAND_DEFAULTS.density, DENSITIES),
  }
}

// The full font-family value; inter is the variable font of @fontsource-variable/inter.
const SYSTEM_STACK =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'"
const FONT_STACK: Record<Brand['font'], string> = {
  system: SYSTEM_STACK,
  inter:
    "'Inter Variable', ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'",
}

const RADIUS_REM: Record<Brand['radius'], string> = { sm: '0.25rem', md: '0.5rem', lg: '0.75rem' }

// The generated placeholders of a frontend package. THEME_LIGHT and THEME_DARK are blocks of
// two-space-indented `--token: oklch(...);` lines, to sit alone on a line at column 0 inside
// `:root { }` and `.dark { }`. Throws ThemeError when a seed cannot pass the contrast checks.
export function brandPlaceholders(brand: Brand): Record<string, string> {
  const theme = buildTheme({ primary: brand.primary, neutral: brand.neutral })
  return {
    PROJECT_DISPLAY_NAME: brand.displayName,
    THEME_LIGHT: renderTokens(theme.light),
    THEME_DARK: renderTokens(theme.dark),
    THEME_RADIUS: RADIUS_REM[brand.radius],
    THEME_DEFAULT: brand.theme,
    THEME_DENSITY: brand.density,
    THEME_FONT: brand.font,
    THEME_FONT_STACK: FONT_STACK[brand.font],
  }
}

// One line per mode in which the theme builder moved the primary's lightness so it reads as link
// text (4.5:1 on the page, cards and popovers). The dark baseline is the lighter step it starts from.
export function brandNotes(brand: Brand): string[] {
  const seed = hexToOklch(brand.primary)
  const theme = buildTheme({ primary: brand.primary, neutral: brand.neutral })
  const notes: string[] = []
  for (const [mode, from] of [
    ['light', seed.l],
    ['dark', Math.max(seed.l, 0.62)],
  ] as const) {
    const shipped = theme[mode].primary
    if (Math.abs(shipped.l - from) <= 0.0015) continue
    notes.push(
      `note: --brand-primary ${brand.primary} ships as ${formatOklch(shipped)} in ${mode} mode (${oklchToHex(shipped)}): ` +
        "the button's link variant paints the primary as text, which needs 4.5:1 on the page, cards and popovers",
    )
  }
  return notes
}
