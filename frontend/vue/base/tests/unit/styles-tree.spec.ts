// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// src/styles/ is the only home of CSS. A component renders class names; the one stylesheet import
// is main.ts, so the brand tokens always load before the tree and no component drags in a
// stylesheet of its own. The lint rules (vue/no-restricted-block, vue/no-static-inline-styles,
// no-restricted-imports) refuse the same things per file; this scan is the whole-tree check and
// also reads the bound styles (`:style`, `v-bind:style`) that the static rule does not.
const src = fileURLToPath(new URL('../../src', import.meta.url))

const STYLESHEET_IMPORT = /^\s*import\b[^\n]*\.s?css['"]/m
const STYLE_BLOCK = /<style[\s>]/
const STYLE_ATTRIBUTE = /<[A-Za-z][^<>]*?\s(?:v-bind:|:)?style\s*=/

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : sources(path)
    return /\.(ts|vue)$/.test(entry.name) ? [path] : []
  })
}
const files = sources(src).map((path) => ({
  name: relative(src, path).split(sep).join('/'),
  text: readFileSync(path, 'utf8'),
}))

describe('the detectors', () => {
  it('see a stylesheet import', () => {
    expect(STYLESHEET_IMPORT.test("import '@/styles/styles.scss'")).toBe(true)
    expect(STYLESHEET_IMPORT.test("import './x.css'")).toBe(true)
    expect(STYLESHEET_IMPORT.test("import { x } from './x'")).toBe(false)
  })

  it('see a style block', () => {
    expect(STYLE_BLOCK.test('<style scoped>\np { color: red }\n</style>')).toBe(true)
    expect(STYLE_BLOCK.test('<template><p /></template>')).toBe(false)
  })

  it('see a static, a bound and a long-form style attribute', () => {
    expect(STYLE_ATTRIBUTE.test('<p style="color: red" />')).toBe(true)
    expect(STYLE_ATTRIBUTE.test('<p :style="{ color }" />')).toBe(true)
    expect(STYLE_ATTRIBUTE.test('<p class="a" v-bind:style="s" />')).toBe(true)
    expect(STYLE_ATTRIBUTE.test('<p class="style-guide" />')).toBe(false)
  })
})

describe('the styles tree', () => {
  // The scan is only worth something if it reads the files the rules are about.
  it('scans the shell, the shared components and the entry', () => {
    const names = files.map((file) => file.name)

    expect(names).toEqual(
      expect.arrayContaining([
        'main.ts',
        'app/App.vue',
        'layout/main-layout/main-layout.vue',
        'layout/components/app-header.vue',
        'layout/components/side-nav.vue',
        'layout/components/toast-host.vue',
        'shared/components/base-button.vue',
        'features/not-found/pages/not-found-page.vue',
      ]),
    )
    expect(files.filter((file) => file.name.endsWith('.vue')).length).toBeGreaterThanOrEqual(10)
  })

  it('never lists a generated file', () => {
    expect(files.some((file) => file.name.startsWith('services/generated/'))).toBe(false)
  })

  it('has main.ts as the only file that imports a stylesheet', () => {
    const importers = files
      .filter((file) => STYLESHEET_IMPORT.test(file.text))
      .map((file) => file.name)

    expect(importers).toEqual(['main.ts'])
  })

  it('has no style block in a component', () => {
    const offenders = files
      .filter((file) => file.name.endsWith('.vue') && STYLE_BLOCK.test(file.text))
      .map((file) => file.name)

    expect(offenders).toEqual([])
  })

  it('sets no style attribute in a component', () => {
    const offenders = files
      .filter((file) => file.name.endsWith('.vue') && STYLE_ATTRIBUTE.test(file.text))
      .map((file) => file.name)

    expect(offenders).toEqual([])
  })
})
