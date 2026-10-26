import { describe, expect, test } from 'bun:test'
import {
  NON_TEXT_PAIRS,
  TEXT_PAIRS,
  THEME_TOKENS,
  ThemeError,
  buildTheme,
  contrastRatio,
  hexToOklch,
  inGamut,
  oklchToHex,
  parseOklch,
  renderTokens,
} from '../lib/theme'

const DEFAULT_SEEDS = { primary: '#1d4ed8', neutral: '#64748b' }

describe('colour maths', () => {
  test('black on white is 21:1 and a colour on itself is 1:1', () => {
    const white = hexToOklch('#ffffff')
    const black = hexToOklch('#000000')
    expect(contrastRatio(white, black)).toBeCloseTo(21, 1)
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5)
  })
  test('converts known sRGB colours to OKLCH', () => {
    const white = hexToOklch('#ffffff')
    expect(white.l).toBeCloseTo(1, 3)
    expect(white.c).toBeCloseTo(0, 3)
    const blue = hexToOklch('#1d4ed8')
    expect(blue.l).toBeCloseTo(0.488, 2)
    expect(blue.h).toBeGreaterThan(260)
    expect(blue.h).toBeLessThan(268)
  })
  test('round-trips hex through OKLCH', () => {
    for (const hex of ['#1d4ed8', '#64748b', '#ff0000', '#00ff7f', '#123456']) {
      expect(oklchToHex(hexToOklch(hex))).toBe(hex)
    }
  })
  test('accepts the short form and any case, refuses the rest', () => {
    expect(hexToOklch('#FFF').l).toBeCloseTo(1, 3)
    for (const bad of ['1d4ed8', '#12345', '#gggggg', 'blue', '#1d4ed8ff', '']) {
      expect(() => hexToOklch(bad)).toThrow(ThemeError)
    }
  })
  test('parses what it prints', () => {
    expect(parseOklch('oklch(0.488 0.217 264.4)')).toEqual({ l: 0.488, c: 0.217, h: 264.4 })
    expect(parseOklch('oklch(1 0 0)')).toEqual({ l: 1, c: 0, h: 0 })
    expect(() => parseOklch('rgb(0 0 0)')).toThrow(ThemeError)
  })
})

describe('buildTheme', () => {
  const theme = buildTheme(DEFAULT_SEEDS)

  test('derives every token in both modes', () => {
    for (const mode of [theme.light, theme.dark]) {
      expect(Object.keys(mode)).toEqual([...THEME_TOKENS])
    }
    expect(THEME_TOKENS).toContain('success-foreground')
    expect(THEME_TOKENS).toContain('ring')
    expect(THEME_TOKENS).not.toContain('radius')
  })

  test('is deterministic', () => {
    expect(buildTheme(DEFAULT_SEEDS)).toEqual(theme)
  })

  test('keeps the primary seed as the light primary and a plain white background', () => {
    const seed = hexToOklch('#1d4ed8')
    expect(theme.light.primary.l).toBeCloseTo(seed.l, 2)
    expect(theme.light.primary.h).toBeCloseTo(seed.h, 0)
    expect(theme.light.background).toEqual({ l: 1, c: 0, h: 0 })
    expect(theme.dark.background.l).toBeLessThan(0.2)
  })

  test('every text pair reaches 4.5:1 and every non-text pair 3:1, in both modes', () => {
    for (const mode of [theme.light, theme.dark]) {
      for (const [fg, bg] of TEXT_PAIRS) {
        expect(contrastRatio(mode[fg], mode[bg])).toBeGreaterThanOrEqual(4.5)
      }
      for (const [fg, bg] of NON_TEXT_PAIRS) {
        expect(contrastRatio(mode[fg], mode[bg])).toBeGreaterThanOrEqual(3)
      }
    }
  })

  test('the pairs are the ones the plan names', () => {
    const names = TEXT_PAIRS.map(([fg, bg]) => `${fg}/${bg}`)
    expect(names).toContain('foreground/background')
    expect(names).toContain('muted-foreground/background')
    expect(names).toContain('muted-foreground/muted')
    expect(names).toContain('muted-foreground/card')
    expect(names).toContain('muted-foreground/popover')
    expect(names).toContain('primary-foreground/primary')
    expect(names).toContain('info-foreground/info')
    expect(NON_TEXT_PAIRS.map(([fg, bg]) => `${fg}/${bg}`)).toEqual([
      'input/background',
      'ring/background',
    ])
  })

  test('moves lightness for a seed that fails as given', () => {
    // Mid-grey sits where neither white nor near-black text reaches 4.5:1 on it.
    const grey = buildTheme({ primary: '#767676', neutral: '#64748b' })
    expect(contrastRatio(grey.light['primary-foreground'], grey.light.primary)).toBeGreaterThan(4.5)
    expect(contrastRatio(grey.dark['primary-foreground'], grey.dark.primary)).toBeGreaterThan(4.5)
  })

  test('survives extreme seeds', () => {
    for (const primary of ['#000000', '#ffffff', '#ffff00', '#ff00ff', '#00ffff', '#7f7f7f']) {
      for (const neutral of ['#000000', '#ffffff', '#ff0000', '#808080']) {
        const built = buildTheme({ primary, neutral })
        for (const mode of [built.light, built.dark]) {
          for (const [fg, bg] of TEXT_PAIRS) {
            expect(contrastRatio(mode[fg], mode[bg])).toBeGreaterThanOrEqual(4.5)
          }
        }
      }
    }
  })

  test('names the pair when a seed cannot pass within the allowed shift', () => {
    let message = ''
    try {
      buildTheme({ primary: '#767676', neutral: '#64748b' }, { maxShift: 0 })
    } catch (error) {
      expect(error).toBeInstanceOf(ThemeError)
      message = (error as Error).message
    }
    expect(message).toContain('primary-foreground on primary')
    expect(message).toContain('light')
    expect(message).toContain('4.5:1')
  })

  test('refuses an invalid seed, naming it', () => {
    expect(() => buildTheme({ primary: 'blue', neutral: '#64748b' })).toThrow(/primary/)
    expect(() => buildTheme({ primary: '#1d4ed8', neutral: 'x' })).toThrow(/neutral/)
  })
})

describe('renderTokens', () => {
  const theme = buildTheme(DEFAULT_SEEDS)

  test('prints one indented declaration per token, in order', () => {
    const lines = renderTokens(theme.light).split('\n')
    expect(lines).toHaveLength(THEME_TOKENS.length)
    expect(lines[0]).toBe('  --background: oklch(1 0 0);')
    for (const [index, line] of lines.entries()) {
      expect(line).toMatch(
        new RegExp(`^  --${THEME_TOKENS[index]}: oklch\\([0-9.]+ [0-9.]+ [0-9.]+\\);$`),
      )
    }
  })

  test('what it prints is what the contrast was computed on', () => {
    const printed = Object.fromEntries(
      renderTokens(theme.dark)
        .split('\n')
        .map((line) => {
          const [, name, value] = /^ {2}--([a-z-]+): (oklch\(.*\));$/.exec(line) ?? []
          return [name, parseOklch(value as string)]
        }),
    )
    for (const [fg, bg] of TEXT_PAIRS) {
      expect(contrastRatio(printed[fg]!, printed[bg]!)).toBeGreaterThanOrEqual(4.5)
    }
  })

  test('holds on the 8-bit values a browser paints, with the ratio computed from the hex', () => {
    const ratio = (a: string, b: string) => {
      const y = (hex: string) => {
        const lin = [1, 3, 5].map((i) => {
          const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
        }) as [number, number, number]
        return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
      }
      const [hi, lo] = [y(a), y(b)].sort((p, q) => q - p) as [number, number]
      return (hi + 0.05) / (lo + 0.05)
    }
    for (const seeds of [DEFAULT_SEEDS, { primary: '#767676', neutral: '#808080' }]) {
      const built = buildTheme(seeds)
      for (const mode of [built.light, built.dark]) {
        for (const [fg, bg] of TEXT_PAIRS) {
          expect(ratio(oklchToHex(mode[fg]), oklchToHex(mode[bg]))).toBeGreaterThanOrEqual(4.5)
        }
        for (const [fg, bg] of NON_TEXT_PAIRS) {
          expect(ratio(oklchToHex(mode[fg]), oklchToHex(mode[bg]))).toBeGreaterThanOrEqual(3)
        }
      }
    }
  })

  test('stays inside the sRGB gamut so no browser has to map the colour', () => {
    for (const mode of [theme.light, theme.dark]) {
      for (const token of THEME_TOKENS) {
        expect(inGamut(mode[token])).toBe(true)
      }
    }
  })
})
