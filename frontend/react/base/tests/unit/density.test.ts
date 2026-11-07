// @vitest-environment node
import { fileURLToPath } from 'node:url'

import { compile } from 'sass-embedded'
import { describe, expect, it } from 'vitest'

// Compiles the whole tree (brand.css is plain CSS that main.tsx loads, so it is not part of it)
// and reads the sizing contract off the CSS text: 36 px, 32 px compact on a fine pointer, 44 px
// on a coarse one whatever the density.
const entry = fileURLToPath(new URL('../../src/styles/styles.scss', import.meta.url))
const loadPath = fileURLToPath(new URL('../../src/styles', import.meta.url))
const css = compile(entry, { loadPaths: [loadPath], style: 'expanded' }).css

// The body of every top-level `@media` whose prelude contains `query`, joined.
function media(query: string): string {
  return [...css.matchAll(/^@media ([^{]+)\{\n([\s\S]*?)\n\}/gm)]
    .filter((rule) => rule[1]?.includes(query))
    .map((rule) => rule[2])
    .join('\n')
}

// The CSS outside every top-level `@media`.
const topLevel = css.replace(/^@media [^{]+\{\n[\s\S]*?\n\}/gm, '')

describe('the compiled styles tree', () => {
  it('sizes a control at 36 px', () => {
    expect(topLevel).toMatch(/\n\.button\s*\{[^}]*min-block-size:\s*2\.25rem/)
  })

  it('shrinks a fine pointer control to 32 px under compact density', () => {
    expect(media('(pointer: fine)')).toMatch(
      /\[data-density=['"]?compact['"]?\] \.button\s*\{[^}]*min-block-size:\s*2rem/,
    )
  })

  it('floors a coarse pointer control at 44 px whatever the density', () => {
    const coarse = media('(pointer: coarse)')

    expect(coarse).toMatch(/\.button\s*\{[^}]*min-block-size:\s*(44px|2\.75rem)/)
    expect(coarse).toMatch(/\.button\s*\{[^}]*min-inline-size:\s*(44px|2\.75rem)/)
  })

  it.each(['.button--sm', '.header__brand', '.nav-links__link'])(
    'floors %s at 44 px under a coarse pointer',
    (selector) => {
      const own = new RegExp(
        String.raw`${selector.replace('.', String.raw`\.`)}\s*\{[^}]*min-block-size:\s*(44px|2\.75rem)`,
      )

      expect(media('(pointer: coarse)')).toMatch(own)
    },
  )

  // .button--icon sets no height of its own: it is a .button, which carries the floor.
  it('floors an icon button through .button under a coarse pointer', () => {
    expect(media('(pointer: coarse)')).toMatch(
      /\.button\s*\{[^}]*min-inline-size:\s*(44px|2\.75rem)/,
    )
    expect(topLevel).not.toMatch(/\.button--icon\s*\{[^}]*min-block-size/)
  })

  it('makes an icon button 2.25rem square, 2rem under compact on a fine pointer', () => {
    expect(topLevel).toMatch(/\.button--icon\s*\{[^}]*inline-size:\s*2\.25rem/)
    expect(media('(pointer: fine)')).toMatch(
      /\[data-density=['"]?compact['"]?\] \.button--icon\s*\{[^}]*inline-size:\s*2rem/,
    )
  })

  it('applies compact density to a fine pointer only', () => {
    expect(topLevel).not.toMatch(/\[data-density=['"]?compact['"]?\] \.button/)
  })

  it('themes dark by attribute and never by a class', () => {
    expect(css).toMatch(/\[data-theme=['"]?dark['"]?\]\s*\{/)
    expect(css).not.toMatch(/\.dark\b/)
  })

  it('carries no Tailwind directive', () => {
    expect(css).not.toMatch(/@tailwind|@apply/)
  })
})
