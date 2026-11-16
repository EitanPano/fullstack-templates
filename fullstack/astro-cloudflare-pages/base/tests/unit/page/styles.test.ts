// The styling rules, read off the source and the compiled CSS: the global tree is exactly four
// entries, a component's sheet sits beside it, nothing is inline (the CSP has no 'unsafe-inline'),
// every property is logical, and a control keeps its sizes and its 44 px touch target.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { compile } from 'sass-embedded'
import { describe, expect, it } from 'vitest'

const src = path.resolve('src')
const styles = path.join(src, 'styles')

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? files(full) : [full]
  })
}

const all = files(src)
const astroFiles = all.filter((file) => file.endsWith('.astro'))
const scssFiles = all.filter((file) => file.endsWith('.scss'))
const siblingSheets = scssFiles.filter((file) => !file.startsWith(styles))

describe('the global tree', () => {
  it('is styles.scss, setup/, themes/ and basics/, plus the generated brand.css', () => {
    expect(readdirSync(styles).sort()).toEqual(['basics', 'setup', 'styles.scss', 'themes'])
    expect(readdirSync(path.join(styles, 'themes')).sort()).toEqual([
      '_dark.scss',
      '_index.scss',
      '_light.scss',
      'brand.css',
    ])
  })

  it('declares its layers first, in order', () => {
    expect(readFileSync(path.join(styles, 'setup/_layers.scss'), 'utf8')).toContain(
      '@layer setup, themes, basics;',
    )
    expect(
      readFileSync(path.join(styles, 'styles.scss'), 'utf8').indexOf('setup/layers'),
    ).toBeLessThan(
      readFileSync(path.join(styles, 'styles.scss'), 'utf8').indexOf('setup/variables'),
    )
  })
})

describe('component sheets', () => {
  it('carries a sibling sheet with its own stem, imported by the component', () => {
    for (const sheet of siblingSheets) {
      const stem = path.basename(sheet, '.scss')
      const owner = path.join(path.dirname(sheet), `${stem}.astro`)
      expect(astroFiles, `${stem}.scss needs ${stem}.astro beside it`).toContain(owner)
      expect(readFileSync(owner, 'utf8')).toContain(`import './${stem}.scss'`)
    }
  })

  it('writes no style element or attribute in a template: the CSP forbids inline styles', () => {
    for (const file of astroFiles) {
      const text = readFileSync(file, 'utf8')
      expect(text, file).not.toMatch(/<style[\s>]/)
      expect(text, file).not.toMatch(/\sstyle=/)
    }
  })

  it('never writes a whole-line // @word comment (the generator reads it as a marker)', () => {
    for (const file of scssFiles) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/^\s*\/\/\s*@\w/m)
    }
  })

  it('uses logical properties only, so the layout mirrors under dir="rtl"', () => {
    const physical =
      /\b(margin|padding|border)-(left|right)\b|(^|[\s{;])(left|right)\s*:|text-align:\s*(left|right)|(^|[\s{;])(width|height|min-width|max-width|min-height|max-height)\s*:/m
    for (const file of scssFiles) {
      expect(readFileSync(file, 'utf8').replace(/\/\/.*$/gm, ''), file).not.toMatch(physical)
    }
  })
})

const compiled = [path.join(styles, 'styles.scss'), ...siblingSheets]
  .map((file) => compile(file, { loadPaths: [styles], style: 'expanded' }).css)
  .join('\n')

describe('the compiled CSS', () => {
  it('sizes a control at 36 px, 32 px compact on a fine pointer', () => {
    expect(compiled).toMatch(/\n\.button\s*\{[^}]*min-block-size:\s*2\.25rem/)
    expect(compiled).toMatch(
      /\[data-density=['"]?compact['"]?\] \.button\s*\{[^}]*min-block-size:\s*2rem/,
    )
  })

  it('floors every control at 44 px under a coarse pointer, whatever the density', () => {
    const coarse = [...compiled.matchAll(/@media \(pointer: coarse\)\s*\{([\s\S]*?\n)\}/g)]
      .map((match) => match[1])
      .join('\n')
    for (const selector of ['.button', '.input', '.skip-link']) {
      expect(coarse, selector).toMatch(
        new RegExp(`${selector.replace('.', '\\.')}\\s*\\{[^}]*min-block-size:\\s*44px`),
      )
    }
  })

  it('tightens the page container under compact density', () => {
    expect(compiled).toMatch(
      /\[data-density=['"]?compact['"]?\] \.page-container\s*\{[^}]*padding-block:\s*16px/,
    )
  })
})
