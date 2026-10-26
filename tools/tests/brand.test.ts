import { describe, expect, test } from 'bun:test'
import { BrandError, BRAND_DEFAULTS, brandPlaceholders, resolveBrand } from '../lib/brand'
import { THEME_TOKENS } from '../lib/theme'

describe('resolveBrand', () => {
  test('defaults to today blue on a neutral slate and titles the project name', () => {
    expect(resolveBrand({}, 'plant-care')).toEqual({
      displayName: 'Plant Care',
      primary: '#1d4ed8',
      neutral: '#64748b',
      radius: 'md',
      font: 'system',
      theme: 'system',
      density: 'comfortable',
    })
    expect(BRAND_DEFAULTS.primary).toBe('#1d4ed8')
  })

  test('takes every input and normalises the hex to six lowercase digits', () => {
    const brand = resolveBrand(
      {
        displayName: 'Studio 54',
        primary: '#ABC',
        neutral: '#112233',
        radius: 'lg',
        font: 'inter',
        theme: 'dark',
        density: 'compact',
      },
      'demo',
    )
    expect(brand).toEqual({
      displayName: 'Studio 54',
      primary: '#aabbcc',
      neutral: '#112233',
      radius: 'lg',
      font: 'inter',
      theme: 'dark',
      density: 'compact',
    })
  })

  test.each([
    [{ primary: 'blue' }, '--brand-primary'],
    [{ neutral: '#12' }, '--brand-neutral'],
    [{ radius: 'xl' }, '--radius'],
    [{ font: 'comic' }, '--font'],
    [{ theme: 'auto' }, '--theme'],
    [{ density: 'tight' }, '--density'],
    [{ displayName: '' }, '--display-name'],
    [{ displayName: 'a'.repeat(61) }, '--display-name'],
  ])('refuses %j, naming %s', (input, option) => {
    expect(() => resolveBrand(input, 'demo')).toThrow(BrandError)
    expect(() => resolveBrand(input, 'demo')).toThrow(option)
  })

  test.each(['Ben & Jerry', "It's", 'a"b', 'a<b>', 'a`b', 'a$b', 'a\b', 'a\nb', '{x}', '-x'])(
    'refuses the display name %j, which would break a JSON, TS or HTML context',
    (displayName) => {
      expect(() => resolveBrand({ displayName }, 'demo')).toThrow(BrandError)
    },
  )

  test('accepts accents and a few safe marks in a display name', () => {
    expect(resolveBrand({ displayName: 'Café Noël, Inc. - No. 5!' }, 'x').displayName).toBe(
      'Café Noël, Inc. - No. 5!',
    )
  })
})

describe('resolveBrand: display name edge cases', () => {
  test('refuses a name holding two underscores, which would read as a placeholder', () => {
    expect(() => resolveBrand({ displayName: 'My __PORT__ app' }, 'demo')).toThrow(/__/)
    expect(() => resolveBrand({ displayName: 'a__b' }, 'demo')).toThrow(BrandError)
    expect(resolveBrand({ displayName: 'snake_case' }, 'demo').displayName).toBe('snake_case')
  })
  test('truncates a derived name at a word boundary instead of failing', () => {
    const project = 'a-very-long-project-name-' + 'word-'.repeat(20) + 'end'
    const name = resolveBrand({}, project).displayName
    expect(name.length).toBeLessThanOrEqual(60)
    expect(name.endsWith(' ')).toBe(false)
    expect(name.startsWith('A Very Long Project Name Word')).toBe(true)
    expect(/Word$|Name$/.test(name)).toBe(true)
  })
  test('still refuses a long name the user gave', () => {
    expect(() => resolveBrand({ displayName: 'a'.repeat(61) }, 'demo')).toThrow('--display-name')
  })
})

describe('brandPlaceholders', () => {
  const placeholders = brandPlaceholders(resolveBrand({}, 'demo'))

  test('names the generated tokens', () => {
    expect(Object.keys(placeholders).sort()).toEqual([
      'PROJECT_DISPLAY_NAME',
      'THEME_DARK',
      'THEME_DEFAULT',
      'THEME_DENSITY',
      'THEME_FONT',
      'THEME_FONT_STACK',
      'THEME_LIGHT',
      'THEME_RADIUS',
    ])
    expect(placeholders.PROJECT_DISPLAY_NAME).toBe('Demo')
    expect(placeholders.THEME_DEFAULT).toBe('system')
    expect(placeholders.THEME_DENSITY).toBe('comfortable')
    expect(placeholders.THEME_FONT).toBe('system')
    expect(placeholders.THEME_FONT_STACK).toBe(
      "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'",
    )
  })

  test('holds one declaration per token in each block, and a rem radius', () => {
    for (const block of [placeholders.THEME_LIGHT, placeholders.THEME_DARK]) {
      expect(block?.split('\n')).toHaveLength(THEME_TOKENS.length)
    }
    expect(placeholders.THEME_LIGHT).toContain('  --primary: oklch(')
    expect(placeholders.THEME_RADIUS).toBe('0.5rem')
  })

  test('maps the radius choices to rem', () => {
    const radius = (value: string) =>
      brandPlaceholders(resolveBrand({ radius: value }, 'demo')).THEME_RADIUS
    expect([radius('sm'), radius('md'), radius('lg')]).toEqual(['0.25rem', '0.5rem', '0.75rem'])
  })
})

describe('THEME_FONT_STACK', () => {
  test('inter puts the variable font first and keeps the system fallbacks', () => {
    const stack = brandPlaceholders(resolveBrand({ font: 'inter' }, 'demo')).THEME_FONT_STACK
    expect(stack).toBe(
      "'Inter Variable', ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'",
    )
  })
})
