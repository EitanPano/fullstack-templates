// The theme builder: two seed colours in, the light and dark values of every design token out,
// as OKLCH. Pure maths on Node built-ins (no colour library): the OKLab matrices are Björn
// Ottosson's, the contrast is WCAG 2.x relative luminance.

export interface Oklch {
  l: number
  c: number
  h: number
}

export class ThemeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ThemeError'
  }
}

// The token names are the plan's D3 set, in the order they are printed.
export const THEME_TOKENS = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'success',
  'success-foreground',
  'warning',
  'warning-foreground',
  'info',
  'info-foreground',
  'border',
  'input',
  'ring',
] as const

export type ThemeToken = (typeof THEME_TOKENS)[number]
export type ThemeTokens = Record<ThemeToken, Oklch>
export interface Theme {
  light: ThemeTokens
  dark: ThemeTokens
}

type Pair = readonly [foreground: ThemeToken, background: ThemeToken]

const TEXT_MIN = 4.5
const NON_TEXT_MIN = 3

// Text on its surface. muted-foreground is also used on the page background, cards and popovers.
export const TEXT_PAIRS: readonly Pair[] = [
  ['foreground', 'background'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['primary-foreground', 'primary'],
  // The link variant of the button paints primary text on the page, cards and popovers.
  ['primary', 'background'],
  ['primary', 'card'],
  ['primary', 'popover'],
  ['secondary-foreground', 'secondary'],
  ['muted-foreground', 'muted'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
  ['muted-foreground', 'popover'],
  ['accent-foreground', 'accent'],
  ['destructive-foreground', 'destructive'],
  ['success-foreground', 'success'],
  ['warning-foreground', 'warning'],
  ['info-foreground', 'info'],
]

// Control borders and the focus ring (WCAG 1.4.11).
export const NON_TEXT_PAIRS: readonly Pair[] = [
  ['input', 'background'],
  ['ring', 'background'],
]

// ---- colour maths ----

type Rgb = readonly [number, number, number]

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const toGamma = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)

function linearToOklch([r, g, b]: Rgb): Oklch {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const c = Math.hypot(a, bb)
  const h = c < 1e-6 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360
  return { l: L, c, h }
}

// Linear sRGB, unclamped: a value outside 0..1 means the colour is outside the gamut.
function oklchToLinear({ l, c, h }: Oklch): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
}

const GAMUT_EPSILON = 1e-4

export function inGamut(color: Oklch): boolean {
  return oklchToLinear(color).every((v) => v >= -GAMUT_EPSILON && v <= 1 + GAMUT_EPSILON)
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export function hexToOklch(hex: string): Oklch {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex)
  if (match === null) throw new ThemeError(`"${hex}" is not a hex colour (#rgb or #rrggbb)`)
  const digits =
    (match[1] as string).length === 3
      ? [...(match[1] as string)].map((d) => d + d).join('')
      : (match[1] as string)
  const channel = (at: number) => toLinear(Number.parseInt(digits.slice(at, at + 2), 16) / 255)
  return linearToOklch([channel(0), channel(2), channel(4)])
}

export function oklchToHex(color: Oklch): string {
  return (
    '#' +
    oklchToLinear(color)
      .map((v) =>
        Math.round(toGamma(clamp01(v)) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  )
}

// Luminance of the 8-bit sRGB value a browser paints, not of the exact float, so a pair that
// computes to 4.5 cannot ship at 4.49.
function luminance(color: Oklch): number {
  const [r, g, b] = oklchToLinear(color).map((v) =>
    toLinear(Math.round(toGamma(clamp01(v)) * 255) / 255),
  ) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: Oklch, b: Oklch): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

// ---- printing ----

const round = (value: number, digits: number) => Number(value.toFixed(digits))

export function formatOklch({ l, c, h }: Oklch): string {
  return `oklch(${String(l)} ${String(c)} ${String(c === 0 ? 0 : h)})`
}

export function parseOklch(css: string): Oklch {
  const match = /^oklch\(([0-9.]+) ([0-9.]+) ([0-9.]+)\)$/.exec(css)
  if (match === null) throw new ThemeError(`"${css}" is not an oklch(L C H) colour`)
  return { l: Number(match[1]), c: Number(match[2]), h: Number(match[3]) }
}

export function renderTokens(tokens: ThemeTokens): string {
  return THEME_TOKENS.map((name) => `  --${name}: ${formatOklch(tokens[name])};`).join('\n')
}

// ---- building ----

// The largest chroma that stays inside sRGB at this lightness and hue (bisection; the in-gamut
// chroma range at a fixed lightness and hue is an interval from zero).
function maxChroma(l: number, h: number): number {
  let [lo, hi] = [0, 0.4]
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (inGamut({ l, c: mid, h })) lo = mid
    else hi = mid
  }
  return lo
}

// Rounded as printed, with the chroma floored into the gamut, so what is checked is what ships and
// no browser has to gamut-map it.
function color(l: number, c: number, h: number): Oklch {
  const lightness = round(Math.min(1, Math.max(0, l)), 3)
  const hue = round(((h % 360) + 360) % 360, 1)
  const chroma = Math.floor(Math.min(c, maxChroma(lightness, hue)) * 1000) / 1000
  return { l: lightness, c: chroma, h: chroma === 0 ? 0 : hue }
}

const withLightness = (from: Oklch, l: number) => color(l, from.c, from.h)

export interface ThemeOptions {
  // How far the contrast fix may move a seed-derived colour, in OKLCH lightness.
  maxShift?: number
}

const DEFAULT_MAX_SHIFT = 0.12
const STEP = 0.005
const NEUTRAL_MAX_CHROMA = 0.03

type Mode = 'light' | 'dark'

const isPair = (pair: Pair | readonly Pair[]): pair is Pair => typeof pair[0] === 'string'

class Builder {
  constructor(private readonly mode: Mode) {}

  // A neutral scale stop: the neutral seed's hue, its chroma capped and faded toward white/black.
  neutral(seed: Oklch, l: number): Oklch {
    const fade = Math.min(1, (1 - l) / 0.1, l / 0.1)
    return color(l, Math.min(seed.c, NEUTRAL_MAX_CHROMA) * Math.max(0, fade), seed.h)
  }

  fail(pair: Pair, ratio: number, min: number): never {
    throw new ThemeError(
      `theme: ${pair[0]} on ${pair[1]} reaches ${ratio.toFixed(1)}:1 in ${this.mode} mode, needs ${min}:1; ` +
        'change --brand-primary or --brand-neutral',
    )
  }

  // Moves `movable` in lightness, away from what it must contrast with, until every background
  // gives `min`. `shiftLimit` bounds the move so a brand colour stays recognisable. `pair` is
  // one pair, or one per background (same order) so a failure names the surface that fails.
  adjust(
    movable: Oklch,
    against: readonly Oklch[],
    min: number,
    direction: -1 | 1,
    shiftLimit: number,
    pair: Pair | readonly Pair[],
  ): Oklch {
    const worst = (c: Oklch) => Math.min(...against.map((other) => contrastRatio(c, other)))
    const failing = (c: Oklch): Pair => {
      if (isPair(pair)) return pair
      const ratios = against.map((other) => contrastRatio(c, other))
      return pair[ratios.indexOf(Math.min(...ratios))] as Pair
    }
    // A colour that already passes ships as it is, not re-rounded.
    if (worst(movable) >= min) return movable
    for (let shift = STEP; ; shift += STEP) {
      const current = withLightness(movable, movable.l + direction * shift)
      if (worst(current) >= min) return current
      const atEdge = direction === -1 ? current.l <= 0 : current.l >= 1
      if (shift + STEP > shiftLimit + 1e-9 || atEdge)
        this.fail(failing(current), worst(current), min)
    }
  }

  // The better of two foreground candidates for a surface; when neither passes, the surface moves.
  // `fixed` pins that move's direction (a surface that must keep reading as text on the page
  // may only move away from it) and so the candidate that works with it.
  surfaceWithForeground(
    surface: Oklch,
    candidates: readonly [Oklch, Oklch],
    pair: Pair,
    shiftLimit: number,
    fixed?: -1 | 1,
  ): { surface: Oklch; foreground: Oklch } {
    for (const foreground of candidates) {
      if (contrastRatio(foreground, surface) >= TEXT_MIN) return { surface, foreground }
    }
    const byContrast = [...candidates].sort(
      (a, b) => contrastRatio(b, surface) - contrastRatio(a, surface),
    )
    // Darkening a surface needs the lighter ink, lightening it the darker one.
    const best =
      fixed === undefined
        ? (byContrast[0] as Oklch)
        : candidates.find((c) => (c.l > surface.l ? -1 : 1) === fixed)
    // The inks straddle every surface a brand primary can reach: the light one is above it and
    // the dark one below it.
    if (best === undefined)
      throw new Error(`theme: no ink works with moving ${pair[1]} away from the page`)
    // A light foreground needs a darker surface, and the other way round.
    const direction = fixed ?? (best.l > surface.l ? -1 : 1)
    return {
      surface: this.adjust(surface, [best], TEXT_MIN, direction, shiftLimit, pair),
      foreground: best,
    }
  }
}

function buildMode(
  mode: Mode,
  primarySeed: Oklch,
  neutralSeed: Oklch,
  maxShift: number,
): ThemeTokens {
  const b = new Builder(mode)
  const dark = mode === 'dark'
  const n = (l: number) => b.neutral(neutralSeed, l)

  const background = n(dark ? 0.145 : 1)
  const foreground = n(dark ? 0.985 : 0.145)
  const card = dark ? n(0.205) : background
  const popover = card
  const surfaceInk = dark ? n(0.985) : n(0.205)
  const lightInk = n(0.985)
  const darkInk = n(0.145)
  // Light mode prefers light text on a saturated surface, dark mode the opposite.
  const inks: readonly [Oklch, Oklch] = dark ? [darkInk, lightInk] : [lightInk, darkInk]

  const solid = (surface: Oklch, pair: Pair, shiftLimit: number, fixed?: -1 | 1) =>
    b.surfaceWithForeground(surface, inks, pair, shiftLimit, fixed)

  // Brand colours: the seed in light mode, a lighter step in dark mode.
  const primarySurface = dark
    ? color(Math.max(primarySeed.l, 0.62), primarySeed.c, primarySeed.h)
    : color(primarySeed.l, primarySeed.c, primarySeed.h)
  // Primary is also text (the link button): its lightness moves, uncapped, until it reads on the
  // page, cards and popovers. Hue and chroma stay; maxShift only bounds the foreground fix below.
  const primaryText = b.adjust(
    primarySurface,
    [background, card, popover],
    TEXT_MIN,
    dark ? 1 : -1,
    1,
    [
      ['primary', 'background'],
      ['primary', 'card'],
      ['primary', 'popover'],
    ],
  )
  const primary = solid(primaryText, ['primary-foreground', 'primary'], maxShift, dark ? 1 : -1)

  const semantic = (l: number, chroma: number, hue: number, name: ThemeToken) => {
    const pair: Pair = [`${name}-foreground` as ThemeToken, name]
    return solid(color(l, chroma, hue), pair, 1)
  }
  const destructive = semantic(
    dark ? 0.704 : 0.577,
    dark ? 0.191 : 0.245,
    dark ? 22.2 : 27.3,
    'destructive',
  )
  const success = semantic(dark ? 0.696 : 0.527, 0.17, 150, 'success')
  const warning = semantic(dark ? 0.828 : 0.769, 0.189, dark ? 84 : 75, 'warning')
  const info = semantic(dark ? 0.7 : 0.546, 0.17, 245, 'info')

  const secondary = n(dark ? 0.269 : 0.97)
  const muted = n(dark ? 0.269 : 0.97)
  const accent = n(dark ? 0.269 : 0.97)
  const mutedForeground = b.adjust(
    n(dark ? 0.708 : 0.556),
    [background, muted, card],
    TEXT_MIN,
    dark ? 1 : -1,
    1,
    ['muted-foreground', 'muted'],
  )
  const input = b.adjust(n(dark ? 0.45 : 0.708), [background], NON_TEXT_MIN, dark ? 1 : -1, 1, [
    'input',
    'background',
  ])
  const ring = b.adjust(primary.surface, [background], NON_TEXT_MIN, dark ? 1 : -1, 1, [
    'ring',
    'background',
  ])

  return {
    background,
    foreground,
    card,
    'card-foreground': foreground,
    popover,
    'popover-foreground': foreground,
    primary: primary.surface,
    'primary-foreground': primary.foreground,
    secondary,
    'secondary-foreground': surfaceInk,
    muted,
    'muted-foreground': mutedForeground,
    accent,
    'accent-foreground': surfaceInk,
    destructive: destructive.surface,
    'destructive-foreground': destructive.foreground,
    success: success.surface,
    'success-foreground': success.foreground,
    warning: warning.surface,
    'warning-foreground': warning.foreground,
    info: info.surface,
    'info-foreground': info.foreground,
    border: n(dark ? 0.3 : 0.922),
    input,
    ring,
  }
}

// The last line of defence: every pair of the finished tokens, as printed.
function verify(mode: Mode, tokens: ThemeTokens): void {
  const b = new Builder(mode)
  for (const [pairs, min] of [
    [TEXT_PAIRS, TEXT_MIN],
    [NON_TEXT_PAIRS, NON_TEXT_MIN],
  ] as const) {
    for (const pair of pairs) {
      const ratio = contrastRatio(tokens[pair[0]], tokens[pair[1]])
      if (ratio < min) b.fail(pair, ratio, min)
    }
  }
}

function seedColor(name: string, hex: string): Oklch {
  try {
    return hexToOklch(hex)
  } catch (error) {
    throw new ThemeError(`theme: the ${name} seed ${(error as Error).message}`)
  }
}

export function buildTheme(
  seeds: { primary: string; neutral: string },
  options: ThemeOptions = {},
): Theme {
  const primary = seedColor('primary', seeds.primary)
  const neutral = seedColor('neutral', seeds.neutral)
  const maxShift = options.maxShift ?? DEFAULT_MAX_SHIFT
  const theme: Theme = {
    light: buildMode('light', primary, neutral, maxShift),
    dark: buildMode('dark', primary, neutral, maxShift),
  }
  verify('light', theme.light)
  verify('dark', theme.dark)
  return theme
}
