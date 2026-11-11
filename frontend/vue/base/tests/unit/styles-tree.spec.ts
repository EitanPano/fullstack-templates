// @vitest-environment node
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

// src/styles/ holds the global and app-wide CSS and nothing else. Every page and component owns a
// stylesheet beside it, with its stem, that the owner's empty `<style lang="scss" src>` block
// references. Each rule below is a pure function over a root directory, so it runs on src/ and
// on a seeded temporary tree. The lint rules (vue/block-lang, vue/no-static-inline-styles,
// no-restricted-imports) refuse the same things per file; this scan is the whole-tree check.
const REAL_SRC = fileURLToPath(new URL('../../src', import.meta.url))

type Entry = { name: string; text: string }

const posix = (path: string) => path.split(sep).join('/')

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : walk(path)
    return [path]
  })
}

function read(root: string, pattern: RegExp): Entry[] {
  return walk(root)
    .filter((path) => pattern.test(path))
    .map((path) => ({ name: posix(relative(root, path)), text: readFileSync(path, 'utf8') }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

const sources = (root: string) => read(root, /\.(ts|vue)$/)
const sheets = (root: string) => read(root, /\.scss$/).filter((e) => !e.name.startsWith('styles/'))
const stem = (name: string) => basename(name, extname(name))

const STYLESHEET_IMPORTS = /^\s*import\b[^\n]*?['"]([^'"]+\.s?css)['"]/gm
const STYLE_ATTRIBUTE = /<[A-Za-z][^<>]*?\s(?:v-bind:|:)?style\s*=/
const STYLE_BLOCKS = /<style([^>]*)>([\s\S]*?)<\/style>/g

// Rule 1: src/styles/ is exactly the global tree.
const STYLES_ENTRIES = ['basics', 'setup', 'styles.scss', 'themes']
function stylesEntries(root: string): string[] {
  return readdirSync(join(root, 'styles')).sort()
}

// Rule 2: every sheet outside src/styles/ has its owner. An owner is a sibling (same directory)
// .vue file with the sheet's stem whose `<style lang="scss" src="./<stem>.scss"></style>` block is
// the last thing in the file; a directory-shared partial is referenced by two or more sibling
// .vue files instead.
function referencers(root: string, sheet: Entry): Entry[] {
  const reference = new RegExp(
    String.raw`<style\b[^>]*\ssrc="\./${basename(sheet.name).replace(/\./g, String.raw`\.`)}"[^>]*>\s*</style>`,
  )
  return sources(root).filter(
    (file) =>
      file.name.endsWith('.vue') &&
      dirname(file.name) === dirname(sheet.name) &&
      reference.test(file.text),
  )
}
function endsWithStyleBlock(text: string): boolean {
  const last = [...text.matchAll(STYLE_BLOCKS)].at(-1)
  return last !== undefined && text.slice(last.index + last[0].length).trim() === ''
}
function ownerless(root: string): string[] {
  return sheets(root).flatMap((sheet) => {
    const owners = referencers(root, sheet)
    if (owners.length >= 2) return []
    const owner = owners[0]
    if (owner && stem(owner.name) === stem(sheet.name)) {
      return endsWithStyleBlock(owner.text)
        ? []
        : [
            `${sheet.name}: ${owner.name} does not end with its <style> block (it must be the last block)`,
          ]
    }
    return [
      owner
        ? `${sheet.name}: its one referencer (${owner.name}) has another stem`
        : `${sheet.name}: no sibling .vue file references it`,
    ]
  })
}

// Rule 3: a style block is empty and points at a sibling; never scoped, never with a body.
function badStyleBlocks(root: string): string[] {
  return sources(root)
    .filter((file) => file.name.endsWith('.vue'))
    .flatMap((file) =>
      [...file.text.matchAll(STYLE_BLOCKS)].flatMap((block) => {
        const attrs = block[1] ?? ''
        const body = block[2] ?? ''
        if (/\bscoped\b/.test(attrs)) {
          return [`${file.name}: a scoped <style> block (sibling sheets are global)`]
        }
        if (body.trim() !== '') {
          return [`${file.name}: a <style> block with a body (the rules go in a sibling .scss)`]
        }
        const src = /\ssrc="([^"]*)"/.exec(attrs)?.[1]
        return src !== undefined && /^\.\/[^/]+\.scss$/.test(src)
          ? []
          : [`${file.name}: <style src="${src ?? ''}"> is not a sibling (src is "./<stem>.scss")`]
      }),
    )
}

// Rule 3b: main.ts alone loads the global tree; no other file imports a stylesheet.
const MAIN_STYLESHEETS = ['@/styles/themes/brand.css', '@/styles/styles.scss']
function badStylesheetImports(root: string): string[] {
  return sources(root).flatMap((file) => {
    const specs = [...file.text.matchAll(STYLESHEET_IMPORTS)].map((m) => m[1] ?? '')
    if (file.name === 'main.ts') {
      return JSON.stringify(specs) === JSON.stringify(MAIN_STYLESHEETS)
        ? []
        : [`main.ts: stylesheets ${specs.join(', ')}, expected ${MAIN_STYLESHEETS.join(', ')}`]
    }
    return specs.map(
      (spec) =>
        `${file.name}: imports ${spec}, only main.ts imports a stylesheet (a component uses <style lang="scss" src>)`,
    )
  })
}

// Rule 4: no style attribute, static or bound.
function inlineStyles(root: string): string[] {
  return sources(root)
    .filter((file) => file.name.endsWith('.vue') && STYLE_ATTRIBUTE.test(file.text))
    .map((file) => file.name)
}

// Rule 5: a component in layout/ carries the app- prefix; shared/components/ has the Base
// primitives and plain names, never app-.
function unprefixed(root: string): string[] {
  const vue = sources(root)
    .map((file) => file.name)
    .filter((name) => name.endsWith('.vue'))
  const chrome = vue.filter((name) => name.startsWith('layout/') && !basename(name).startsWith('app-'))
  const shared = vue.filter(
    (name) => name.startsWith('shared/components/') && basename(name).startsWith('app-'),
  )
  return [...chrome, ...shared]
}

// Rule 6: the global tree is layered, the sibling sheets never are. A global partial holds only
// @use lines, comments and the one @layer block; a rule outside the block escapes the layer order.
function topLevelStatements(text: string): string[] {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const statements: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < code.length; i++) {
    const char = code[i]
    if (char === '{') depth++
    else if (char === '}' && --depth === 0) {
      statements.push(code.slice(start, i + 1).trim())
      start = i + 1
    } else if (char === ';' && depth === 0) {
      statements.push(code.slice(start, i + 1).trim())
      start = i + 1
    }
  }
  const rest = code.slice(start).trim()
  return rest ? [...statements, rest] : statements
}
const LAYER_ORDER = '@layer setup, themes, basics;'
// Every .scss under basics/ and themes/ except _index.scss is wrapped in its layer; setup/ emits
// CSS only from _typography.scss. A new partial with bare rules fails without a list to update.
function globalLayers(root: string): [path: string, layer: string][] {
  const partials = (dir: string) =>
    readdirSync(join(root, 'styles', dir))
      .filter((name) => name.endsWith('.scss') && name !== '_index.scss')
      .sort()
      .map((name): [string, string] => [`${dir}/${name}`, dir])
  return [['setup/_typography.scss', 'setup'], ...partials('themes'), ...partials('basics')]
}
const readStyles = (root: string, path: string) => readFileSync(join(root, 'styles', path), 'utf8')
function layerProblems(root: string): string[] {
  const problems: string[] = []
  if (!readStyles(root, 'setup/_layers.scss').includes(LAYER_ORDER)) {
    problems.push(`styles/setup/_layers.scss: does not declare ${LAYER_ORDER}`)
  }
  const firstUse = /^@use\s.*$/m.exec(readStyles(root, 'styles.scss'))?.[0]
  if (firstUse !== "@use 'setup/layers';") {
    problems.push(
      `styles/styles.scss: the first @use is ${firstUse ?? 'missing'}, expected @use 'setup/layers';`,
    )
  }
  for (const [path, layer] of globalLayers(root)) {
    const text = readStyles(root, path)
    if (!text.includes(`@layer ${layer} {`)) {
      problems.push(`styles/${path}: its rules are not in @layer ${layer} { }`)
      continue
    }
    for (const statement of topLevelStatements(text)) {
      if (statement.startsWith('@use ') || statement.startsWith(`@layer ${layer} {`)) continue
      const first = statement.split('\n')[0]?.trim() ?? ''
      problems.push(`styles/${path}: a top-level statement outside the layer: ${first}`)
    }
  }
  for (const sheet of sheets(root)) {
    if (sheet.text.includes('@layer')) {
      problems.push(`${sheet.name}: a sibling sheet is never layered (unlayered rules win)`)
    }
  }
  return problems
}

describe('the detectors', () => {
  const importsIn = (code: string) => [...code.matchAll(STYLESHEET_IMPORTS)].map((m) => m[1])
  const blocksIn = (code: string) => [...code.matchAll(STYLE_BLOCKS)].length

  it('see a stylesheet import', () => {
    expect(importsIn("import '@/styles/styles.scss'")).toEqual(['@/styles/styles.scss'])
    expect(importsIn("import './x.css'")).toEqual(['./x.css'])
    expect(importsIn("import { x } from './x'")).toEqual([])
  })

  it('see a style block', () => {
    expect(blocksIn('<style scoped>\np { color: red }\n</style>')).toBe(1)
    expect(blocksIn('<template><p /></template>')).toBe(0)
  })

  it('see a static, a bound and a long-form style attribute', () => {
    expect(STYLE_ATTRIBUTE.test('<p style="color: red" />')).toBe(true)
    expect(STYLE_ATTRIBUTE.test('<p :style="{ color }" />')).toBe(true)
    expect(STYLE_ATTRIBUTE.test('<p class="a" v-bind:style="s" />')).toBe(true)
    expect(STYLE_ATTRIBUTE.test('<p class="style-guide" />')).toBe(false)
  })
})

describe('the styles tree', () => {
  it('scans the real tree', () => {
    expect(sources(REAL_SRC).length).toBeGreaterThan(10)
    expect(sheets(REAL_SRC).length).toBeGreaterThan(10)
  })

  it('scans the layouts, the pages, the shared components and the entry', () => {
    const names = sources(REAL_SRC).map((file) => file.name)

    expect(names).toEqual(
      expect.arrayContaining([
        'main.ts',
        'app/App.vue',
        'layout/app-main-layout/app-main-layout.vue',
        'layout/app-theme-toggle/app-theme-toggle.vue',
        'layout/app-toast-host/app-toast-host.vue',
        'shared/components/base-button/base-button.vue',
        'shared/components/page-container/page-container.vue',
        'pages/not-found/not-found-page/not-found-page.vue',
      ]),
    )
  })

  it('never lists a generated file', () => {
    expect(sources(REAL_SRC).some((file) => file.name.startsWith('services/generated/'))).toBe(
      false,
    )
  })

  it('keeps only the global tree in src/styles/', () => {
    expect(stylesEntries(REAL_SRC)).toEqual(STYLES_ENTRIES)
  })

  it('gives every stylesheet outside src/styles/ its owner', () => {
    expect(ownerless(REAL_SRC)).toEqual([])
  })

  it('references a stylesheet through an empty sibling <style src> block only', () => {
    expect(badStyleBlocks(REAL_SRC)).toEqual([])
  })

  it('has main.ts as the only file that imports a stylesheet', () => {
    expect(badStylesheetImports(REAL_SRC)).toEqual([])
  })

  it('sets no style attribute in a component', () => {
    expect(inlineStyles(REAL_SRC)).toEqual([])
  })

  it('prefixes every component in layout/ with app- and none in shared/components/', () => {
    expect(unprefixed(REAL_SRC)).toEqual([])
  })

  it('layers the global tree and no sibling sheet', () => {
    expect(layerProblems(REAL_SRC)).toEqual([])
  })
})

describe('the scan itself', () => {
  const roots: string[] = []
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true })
  })

  const LAYERED = (layer: string) => `@layer ${layer} {\n  a {\n    color: red;\n  }\n}\n`
  const OWNER = (stem: string) =>
    `<script setup lang="ts">\n</script>\n\n<template><p /></template>\n\n<style lang="scss" src="./${stem}.scss"></style>\n`
  const RULE = '.x {\n  color: red;\n}\n'

  // A minimal valid tree, with `extra` files added or replaced.
  function seed(extra: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'styles-tree-'))
    roots.push(root)
    const files: Record<string, string> = {
      'main.ts': "import '@/styles/themes/brand.css'\nimport '@/styles/styles.scss'\nexport {}\n",
      'styles/styles.scss': "@use 'setup/layers';\n@use 'themes';\n",
      'styles/setup/_layers.scss': `${LAYER_ORDER}\n`,
      'styles/setup/_typography.scss': LAYERED('setup'),
      'styles/themes/_light.scss': LAYERED('themes'),
      'styles/themes/_dark.scss': LAYERED('themes'),
      'styles/basics/_base.scss': LAYERED('basics'),
      'styles/basics/_helpers.scss': LAYERED('basics'),
      'styles/basics/_layout.scss': LAYERED('basics'),
      'layout/app-ok/app-ok.vue': OWNER('app-ok'),
      'layout/app-ok/app-ok.scss': RULE,
      ...extra,
    }
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), text)
    }
    return root
  }

  it('passes a tree where every sheet has its owner', () => {
    const root = seed({})

    expect(stylesEntries(root)).toEqual(['basics', 'setup', 'styles.scss', 'themes'])
    expect(ownerless(root)).toEqual([])
    expect(badStyleBlocks(root)).toEqual([])
    expect(badStylesheetImports(root)).toEqual([])
    expect(inlineStyles(root)).toEqual([])
    expect(unprefixed(root)).toEqual([])
    expect(layerProblems(root)).toEqual([])
  })

  it('refuses a stylesheet nobody references', () => {
    const root = seed({ 'pages/x/orphan.scss': RULE })

    expect(ownerless(root)).toEqual(['pages/x/orphan.scss: no sibling .vue file references it'])
  })

  it('accepts a partial that two siblings reference', () => {
    const root = seed({
      'shared/controls.scss': RULE,
      'shared/base-input.vue': OWNER('controls'),
      'shared/base-textarea.vue': OWNER('controls'),
    })

    expect(ownerless(root)).toEqual([])
    expect(badStyleBlocks(root)).toEqual([])
  })

  it('refuses a stylesheet whose single referencer has another stem', () => {
    const root = seed({
      'shared/controls.scss': RULE,
      'shared/base-input.vue': OWNER('controls'),
    })

    expect(ownerless(root)).toEqual([
      'shared/controls.scss: its one referencer (shared/base-input.vue) has another stem',
    ])
  })

  it('refuses a style block that has a body', () => {
    const root = seed({
      'pages/x/page.vue':
        '<template><p /></template>\n\n<style lang="scss">\n.x { color: red; }\n</style>\n',
    })

    expect(badStyleBlocks(root)).toEqual([
      'pages/x/page.vue: a <style> block with a body (the rules go in a sibling .scss)',
    ])
  })

  it('refuses a scoped style block', () => {
    const root = seed({
      'layout/app-ok/app-ok.vue': OWNER('app-ok').replace('lang="scss"', 'scoped lang="scss"'),
    })

    expect(badStyleBlocks(root)).toEqual([
      'layout/app-ok/app-ok.vue: a scoped <style> block (sibling sheets are global)',
    ])
  })

  it('refuses a style block that points away from a sibling', () => {
    const root = seed({
      'pages/x/page.vue':
        '<template><p /></template>\n\n<style lang="scss" src="../y/other.scss"></style>\n',
    })

    expect(badStyleBlocks(root)).toEqual([
      'pages/x/page.vue: <style src="../y/other.scss"> is not a sibling (src is "./<stem>.scss")',
    ])
  })

  it('refuses a style block that is not the last block of its owner', () => {
    const root = seed({
      'layout/app-ok/app-ok.vue':
        '<style lang="scss" src="./app-ok.scss"></style>\n\n<template><p /></template>\n',
    })

    expect(ownerless(root)).toEqual([
      'layout/app-ok/app-ok.scss: layout/app-ok/app-ok.vue does not end with its <style> block (it must be the last block)',
    ])
  })

  it('refuses a stylesheet import outside main.ts', () => {
    const root = seed({
      'pages/x/page.vue':
        '<script setup lang="ts">\nimport \'./page.scss\'\n</script>\n<template><p /></template>\n',
    })

    expect(badStylesheetImports(root)).toEqual([
      'pages/x/page.vue: imports ./page.scss, only main.ts imports a stylesheet (a component uses <style lang="scss" src>)',
    ])
  })

  it('refuses a style attribute', () => {
    const root = seed({ 'pages/x/page.vue': '<template><p :style="s" /></template>\n' })

    expect(inlineStyles(root)).toEqual(['pages/x/page.vue'])
  })

  it('refuses a component in layout/ without the app- prefix', () => {
    const root = seed({ 'layout/thing/thing.vue': '<template><p /></template>\n' })

    expect(unprefixed(root)).toEqual(['layout/thing/thing.vue'])
  })

  it('refuses an app- component in shared/components/', () => {
    const root = seed({ 'shared/components/app-thing.vue': '<template><p /></template>\n' })

    expect(unprefixed(root)).toEqual(['shared/components/app-thing.vue'])
  })

  it('refuses a global partial whose rules are not in their layer', () => {
    const root = seed({ 'styles/basics/_layout.scss': 'a {\n  color: red;\n}\n' })

    expect(layerProblems(root)).toEqual([
      'styles/basics/_layout.scss: its rules are not in @layer basics { }',
    ])
  })

  it('refuses a new basics partial with a bare rule', () => {
    const root = seed({ 'styles/basics/_extra.scss': 'a {\n  color: red;\n}\n' })

    expect(layerProblems(root)).toEqual([
      'styles/basics/_extra.scss: its rules are not in @layer basics { }',
    ])
  })

  it('refuses an extra entry in src/styles/', () => {
    const root = seed({ 'styles/components/_x.scss': RULE })

    expect(stylesEntries(root)).toEqual(['basics', 'components', 'setup', 'styles.scss', 'themes'])
    expect(stylesEntries(root)).not.toEqual(STYLES_ENTRIES)
  })

  it('refuses a main.ts that loads another stylesheet', () => {
    const root = seed({
      'main.ts': "import '@/styles/themes/brand.css'\nimport '@/styles/other.scss'\nexport {}\n",
    })

    expect(badStylesheetImports(root)).toEqual([
      'main.ts: stylesheets @/styles/themes/brand.css, @/styles/other.scss, expected @/styles/themes/brand.css, @/styles/styles.scss',
    ])
  })

  it('refuses a layered sibling sheet', () => {
    const root = seed({ 'layout/app-ok/app-ok.scss': LAYERED('basics') })

    expect(layerProblems(root)).toEqual([
      'layout/app-ok/app-ok.scss: a sibling sheet is never layered (unlayered rules win)',
    ])
  })

  it('refuses a rule left outside the layer block of a global partial', () => {
    const root = seed({
      'styles/basics/_layout.scss': `${LAYERED('basics')}\n.stray {\n  color: red;\n}\n`,
    })

    expect(layerProblems(root)).toEqual([
      'styles/basics/_layout.scss: a top-level statement outside the layer: .stray {',
    ])
  })

  it('accepts @use lines, comments and the one layer block at the top of a global partial', () => {
    const root = seed({
      'styles/basics/_layout.scss': `@use '../setup/functions';\n\n// What this holds.\n/* A block\n   comment { with braces } */\n${LAYERED('basics')}`,
    })

    expect(layerProblems(root)).toEqual([])
  })
})
