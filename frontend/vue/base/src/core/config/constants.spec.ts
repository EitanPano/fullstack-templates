import { describe, expect, it } from 'vitest'

import { DEFAULT_THEME, DISPLAY_NAME, STORAGE_KEYS, THEME_COLORS } from './constants'

describe('STORAGE_KEYS', () => {
  it('spells the theme key the no-flash script reads', () => {
    expect(STORAGE_KEYS.theme).toBe('theme')
  })
})

describe('brand constants', () => {
  it('names the product and a default theme, filled in at generation', () => {
    expect(DISPLAY_NAME).not.toBe('')
    expect(typeof DEFAULT_THEME).toBe('string')
  })

  it('gives the browser chrome a colour per resolved theme', () => {
    expect(THEME_COLORS).toEqual({ light: '#ffffff', dark: '#0a0a0a' })
  })
})
