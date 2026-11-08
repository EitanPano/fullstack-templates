// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { THEME_COLORS } from '../../src/core/config/constants'

// The browser chrome colour is written twice: in index.html (before the app loads) and in
// THEME_COLORS (applied by the theme provider afterwards). This keeps the two from drifting.
const html = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8')

function metaFor(scheme: 'light' | 'dark'): string | undefined {
  const tag = new RegExp(
    String.raw`<meta\s+name="theme-color"\s+content="([^"]+)"\s+media="\(prefers-color-scheme: ${scheme}\)"`,
  )
  return tag.exec(html)?.[1]
}

describe('theme-color metas in index.html', () => {
  it('match THEME_COLORS for the light theme', () => {
    expect(metaFor('light')).toBe(THEME_COLORS.light)
  })

  it('match THEME_COLORS for the dark theme', () => {
    expect(metaFor('dark')).toBe(THEME_COLORS.dark)
  })
})
