// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// src/styles/ is the only home of CSS. A component renders class names; the one stylesheet import
// is main.tsx, so the brand tokens always load before the tree and no component drags in a
// stylesheet of its own.
const src = fileURLToPath(new URL('../../src', import.meta.url))

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : sources(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}
const files = sources(src).map((path) => ({
  name: relative(src, path).split(sep).join('/'),
  text: readFileSync(path, 'utf8'),
}))

describe('the styles tree', () => {
  it('scans the real tree', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it('has main.tsx as the only file that imports a stylesheet', () => {
    const importers = files
      .filter((file) => /^\s*import\b[^\n]*\.s?css['"]/m.test(file.text))
      .map((file) => file.name)

    expect(importers).toEqual(['main.tsx'])
  })

  it('sets no style attribute in a component', () => {
    const offenders = files
      .filter((file) => file.name.endsWith('.tsx') && file.text.includes('style={'))
      .map((file) => file.name)

    expect(offenders).toEqual([])
  })
})
