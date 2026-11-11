// @vitest-environment node
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

// src/styles/ holds the global and app-wide CSS and nothing else. Every page and component owns a
// stylesheet beside it, with its stem, and that file alone imports it. Each rule below is a pure
// function over a root directory, so it runs on src/ and on a seeded temporary tree. In this
// template `app/` holds the pages, and `app/layout.tsx` plays the entry's part.
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

const sources = (root: string) => read(root, /\.tsx?$/)
const sheets = (root: string) => read(root, /\.scss$/).filter((e) => !e.name.startsWith('styles/'))
const isTest = (name: string) => /\.test\.tsx?$/.test(name)
const stem = (name: string) => basename(name, extname(name))
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)

// Rule 1: src/styles/ is exactly the global tree.
const STYLES_ENTRIES = ['basics', 'setup', 'styles.scss', 'themes']
function stylesEntries(root: string): string[] {
  return readdirSync(join(root, 'styles')).sort()
}

// Rule 2: every sheet outside src/styles/ has its owner. An owner is a sibling (same directory)
// non-test source with the sheet's stem that imports it as './<stem>.scss', as its LAST import
// statement (the page's own rules come after everything it composes); a directory-shared partial
// is imported by two or more sibling non-test sources instead.
const IMPORT_STATEMENT = /^import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm
function lastImport(text: string): string | undefined {
  return [...text.matchAll(IMPORT_STATEMENT)].at(-1)?.[1]
}
function ownerless(root: string): string[] {
  const files = sources(root).filter((file) => !isTest(file.name))
  return sheets(root).flatMap((sheet) => {
    const importer = new RegExp(
      String.raw`^\s*import\s+['"]\./${escape(basename(sheet.name))}['"]`,
      'm',
    )
    const importers = files.filter(
      (file) => dirname(file.name) === dirname(sheet.name) && importer.test(file.text),
    )
    if (importers.length >= 2) return []
    if (importers.length === 1 && stem(importers[0]?.name ?? '') === stem(sheet.name)) {
      const owner = importers[0]
      return lastImport(owner?.text ?? '') === `./${basename(sheet.name)}`
        ? []
        : [
            `${sheet.name}: ${owner?.name ?? ''} imports it before another import (it must be the last import)`,
          ]
    }
    return [
      importers.length === 0
        ? `${sheet.name}: no sibling file imports it`
        : `${sheet.name}: its one importer (${importers[0]?.name ?? ''}) has another stem`,
    ]
  })
}

// Rule 3: a stylesheet import points at a sibling; app/layout.tsx alone loads the global tree.
const STYLESHEET_IMPORT = /^\s*import\s+['"]([^'"]+\.s?css)['"]/gm
const ENTRY_STYLESHEETS = ['@/styles/themes/brand.css', '@/styles/styles.scss']
function badStylesheetImports(root: string): string[] {
  return sources(root).flatMap((file) => {
    const specs = [...file.text.matchAll(STYLESHEET_IMPORT)].map((m) => m[1] ?? '')
    if (file.name === 'app/layout.tsx') {
      return JSON.stringify(specs) === JSON.stringify(ENTRY_STYLESHEETS)
        ? []
        : [
            `app/layout.tsx: stylesheets ${specs.join(', ')}, expected ${ENTRY_STYLESHEETS.join(', ')}`,
          ]
    }
    return specs
      .filter((spec) => !/^\.\/[^/]+\.scss$/.test(spec))
      .map((spec) => `${file.name}: imports ${spec}, a stylesheet import is './<stem>.scss'`)
  })
}

// Rule 4: no style attribute.
function inlineStyles(root: string): string[] {
  return sources(root)
    .filter((file) => file.name.endsWith('.tsx') && file.text.includes('style={'))
    .map((file) => file.name)
}

// Rule 5: a component directly in components/ carries the app- prefix.
function unprefixed(root: string): string[] {
  return readdirSync(join(root, 'components'))
    .filter((name) => name.endsWith('.tsx') && !isTest(name) && !name.startsWith('app-'))
    .map((name) => `components/${name}`)
}

// Rule 6: the global tree and the kit are layered, the other sibling sheets never are. A global
// partial or a kit sheet holds only @use lines, comments and its one @layer block; a rule outside
// the block escapes the layer order. The kit is the fourth layer: shared/components/ sheets wrap
// their rules in `@layer kit { }`, while a page's or an app component's sheet stays unlayered so
// it beats both the kit and the global tree in any chunk order.
function topLevelStatements(text: string): string[] {
  const code = stripComments(text)
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
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
// A kit sheet holds only @use lines and comments, then one `@layer kit { }` block.
function kitSheetProblems(sheet: Entry): string[] {
  const statements = topLevelStatements(sheet.text)
  const blocks = statements.filter((statement) => statement.startsWith('@layer kit {'))
  const problems = statements
    .filter((statement) => !statement.startsWith('@use ') && !statement.startsWith('@layer kit {'))
    .map(
      (statement) =>
        `${sheet.name}: a top-level statement outside @layer kit: ${statement.split('\n')[0]?.trim() ?? ''}`,
    )
  if (blocks.length === 0) problems.push(`${sheet.name}: its rules are not in @layer kit { }`)
  if (blocks.length > 1) problems.push(`${sheet.name}: more than one @layer kit block`)
  return problems
}
const LAYER_ORDER = '@layer setup, themes, basics, kit;'
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
    if (sheet.name.startsWith('shared/components/')) problems.push(...kitSheetProblems(sheet))
    else if (stripComments(sheet.text).includes('@layer')) {
      problems.push(`${sheet.name}: a sibling sheet is never layered (unlayered rules win)`)
    }
  }
  return problems
}

describe('the styles tree', () => {
  it('scans the real tree', () => {
    expect(sources(REAL_SRC).length).toBeGreaterThan(10)
    expect(sheets(REAL_SRC).length).toBeGreaterThan(10)
  })

  it('keeps only the global tree in src/styles/', () => {
    expect(stylesEntries(REAL_SRC)).toEqual(STYLES_ENTRIES)
  })

  it('gives every stylesheet outside src/styles/ its owner', () => {
    expect(ownerless(REAL_SRC)).toEqual([])
  })

  it('imports a stylesheet from a sibling file only, app/layout.tsx excepted', () => {
    expect(badStylesheetImports(REAL_SRC)).toEqual([])
  })

  it('sets no style attribute in a component', () => {
    expect(inlineStyles(REAL_SRC)).toEqual([])
  })

  it('prefixes every file in components/ with app-', () => {
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

  // A minimal valid tree, with `extra` files added or replaced.
  function seed(extra: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'styles-tree-'))
    roots.push(root)
    const files: Record<string, string> = {
      'app/layout.tsx':
        "import '@/styles/themes/brand.css'\nimport '@/styles/styles.scss'\nexport {}\n",
      'styles/styles.scss': "@use 'setup/layers';\n@use 'themes';\n",
      'styles/setup/_layers.scss': `${LAYER_ORDER}\n`,
      'styles/setup/_typography.scss': LAYERED('setup'),
      'styles/themes/_light.scss': LAYERED('themes'),
      'styles/themes/_dark.scss': LAYERED('themes'),
      'styles/basics/_base.scss': LAYERED('basics'),
      'styles/basics/_helpers.scss': LAYERED('basics'),
      'styles/basics/_layout.scss': LAYERED('basics'),
      'components/app-ok.tsx': "import './app-ok.scss'\nexport {}\n",
      'components/app-ok.scss': '.app-ok {\n  color: red;\n}\n',
      'shared/components/button.tsx': "import './button.scss'\nexport {}\n",
      'shared/components/button.scss': `@use 'setup/mixins';\n\n${LAYERED('kit')}`,
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
    expect(badStylesheetImports(root)).toEqual([])
    expect(unprefixed(root)).toEqual([])
    expect(layerProblems(root)).toEqual([])
  })

  it('refuses a stylesheet nobody imports', () => {
    const root = seed({ 'app/x/orphan.scss': '.orphan {\n  color: red;\n}\n' })

    expect(ownerless(root)).toEqual(['app/x/orphan.scss: no sibling file imports it'])
  })

  it('accepts a partial that two siblings import', () => {
    const root = seed({
      'shared/controls.scss': '.control {\n  color: red;\n}\n',
      'shared/input.tsx': "import './controls.scss'\nexport {}\n",
      'shared/textarea.tsx': "import './controls.scss'\nexport {}\n",
    })

    expect(ownerless(root)).toEqual([])
  })

  it('refuses a stylesheet whose single importer has another stem', () => {
    const root = seed({
      'shared/controls.scss': '.control {\n  color: red;\n}\n',
      'shared/input.tsx': "import './controls.scss'\nexport {}\n",
    })

    expect(ownerless(root)).toEqual([
      'shared/controls.scss: its one importer (shared/input.tsx) has another stem',
    ])
  })

  it('refuses a stylesheet imported from another directory or through the alias', () => {
    const root = seed({
      'app/x/page.tsx': "import '../y/other.scss'\nimport '@/app/y/more.scss'\nexport {}\n",
    })

    expect(badStylesheetImports(root)).toEqual([
      "app/x/page.tsx: imports ../y/other.scss, a stylesheet import is './<stem>.scss'",
      "app/x/page.tsx: imports @/app/y/more.scss, a stylesheet import is './<stem>.scss'",
    ])
  })

  it('refuses a style attribute', () => {
    const root = seed({ 'app/x/page.tsx': 'export const x = <p style={{ color: "red" }} />\n' })

    expect(inlineStyles(root)).toEqual(['app/x/page.tsx'])
  })

  it('refuses a component in components/ without the app- prefix', () => {
    const root = seed({ 'components/thing.tsx': 'export {}\n' })

    expect(unprefixed(root)).toEqual(['components/thing.tsx'])
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
    const root = seed({ 'styles/components/_x.scss': '.x {\n  color: red;\n}\n' })

    expect(stylesEntries(root)).toEqual(['basics', 'components', 'setup', 'styles.scss', 'themes'])
    expect(stylesEntries(root)).not.toEqual(STYLES_ENTRIES)
  })

  it('refuses an entry that loads another stylesheet', () => {
    const root = seed({
      'app/layout.tsx':
        "import '@/styles/themes/brand.css'\nimport '@/styles/other.scss'\nexport {}\n",
    })

    expect(badStylesheetImports(root)).toEqual([
      'app/layout.tsx: stylesheets @/styles/themes/brand.css, @/styles/other.scss, expected @/styles/themes/brand.css, @/styles/styles.scss',
    ])
  })

  it('refuses a layered sibling sheet', () => {
    const root = seed({ 'components/app-ok.scss': LAYERED('basics') })

    expect(layerProblems(root)).toEqual([
      'components/app-ok.scss: a sibling sheet is never layered (unlayered rules win)',
    ])
  })

  it('refuses a layered page sheet', () => {
    const root = seed({
      'app/x/page.tsx': "import './page.scss'\nexport {}\n",
      'app/x/page.scss': LAYERED('kit'),
    })

    expect(layerProblems(root)).toEqual([
      'app/x/page.scss: a sibling sheet is never layered (unlayered rules win)',
    ])
  })

  it('refuses a kit sheet whose rules are not in @layer kit', () => {
    const root = seed({ 'shared/components/button.scss': '.button {\n  color: red;\n}\n' })

    expect(layerProblems(root)).toEqual([
      'shared/components/button.scss: a top-level statement outside @layer kit: .button {',
      'shared/components/button.scss: its rules are not in @layer kit { }',
    ])
  })

  it('refuses a kit sheet with a rule outside its block', () => {
    const root = seed({
      'shared/components/button.scss': `${LAYERED('kit')}\n.stray {\n  color: red;\n}\n`,
    })

    expect(layerProblems(root)).toEqual([
      'shared/components/button.scss: a top-level statement outside @layer kit: .stray {',
    ])
  })

  it('refuses a kit sheet in another layer', () => {
    const root = seed({ 'shared/components/button.scss': LAYERED('basics') })

    expect(layerProblems(root)).toEqual([
      'shared/components/button.scss: a top-level statement outside @layer kit: @layer basics {',
      'shared/components/button.scss: its rules are not in @layer kit { }',
    ])
  })

  it('accepts a kit sheet with @use lines, comments and its one block', () => {
    const root = seed({
      'shared/components/button.scss': `@use 'setup/mixins';\n\n// What this holds.\n${LAYERED('kit')}`,
    })

    expect(layerProblems(root)).toEqual([])
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

  it('refuses a stylesheet imported before another import', () => {
    const root = seed({
      'components/app-ok.tsx':
        "import './app-ok.scss'\nimport { x } from '@/shared/x'\nexport { x }\n",
    })

    expect(ownerless(root)).toEqual([
      'components/app-ok.scss: components/app-ok.tsx imports it before another import (it must be the last import)',
    ])
  })

  it('sees a multi-line import after the stylesheet import too', () => {
    const root = seed({
      'components/app-ok.tsx':
        "import './app-ok.scss'\nimport {\n  a,\n  b,\n} from '@/shared/x'\nexport { a, b }\n",
    })

    expect(ownerless(root)).toEqual([
      'components/app-ok.scss: components/app-ok.tsx imports it before another import (it must be the last import)',
    ])
  })

  it('accepts the stylesheet import last after several imports', () => {
    const root = seed({
      'components/app-ok.tsx':
        "import {\n  a,\n} from '@/shared/x'\nimport type { B } from '@/shared/y'\nimport './app-ok.scss'\n\nexport { a }\nexport type { B }\n",
    })

    expect(ownerless(root)).toEqual([])
  })
})
