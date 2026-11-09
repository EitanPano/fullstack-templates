// @vitest-environment node
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

// src/styles/ holds the global and app-wide CSS and nothing else. Every component and page owns a
// stylesheet beside its .ts, with its stem, and that component's decorator alone references it.
// Each rule below is a pure function over a root directory, so it runs on src/ and on a seeded
// temporary tree.
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

const isSpec = (name: string) => name.endsWith('.spec.ts')
const sources = (root: string) => read(root, /\.ts$/).filter((e) => !isSpec(e.name))
const sheets = (root: string) => read(root, /\.scss$/).filter((e) => !e.name.startsWith('styles/'))
const stem = (name: string) => basename(name, extname(name))

// Rule 1: src/styles/ is exactly the global tree.
const STYLES_ENTRIES = ['basics', 'setup', 'styles.scss', 'themes']
function stylesEntries(root: string): string[] {
  return readdirSync(join(root, 'styles')).sort()
}

// The stylesheet paths a component decorator references: `styleUrl: '...'` and every string in
// `styleUrls: [...]` (the array may span lines).
const STYLE_URL = /\bstyleUrl\s*:\s*['"]([^'"]+)['"]/g
const STYLE_URLS = /\bstyleUrls\s*:\s*\[([^\]]*)\]/g
function styleReferences(text: string): string[] {
  const single = [...text.matchAll(STYLE_URL)].map((m) => m[1])
  const many = [...text.matchAll(STYLE_URLS)].flatMap((m) =>
    [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((s) => s[1]),
  )
  return [...single, ...many]
}

// Rule 2: every sheet outside src/styles/ has its owner. An owner is the sibling component file
// with the sheet's stem whose decorator references it; a directory-shared sheet (controls.scss)
// is referenced by two or more components in its directory or one level below.
function referrers(root: string): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const file of sources(root)) {
    for (const reference of styleReferences(file.text)) {
      const target = posix(relative(root, resolve(root, dirname(file.name), reference)))
      map.set(target, [...(map.get(target) ?? []), file.name])
    }
  }
  return map
}
function ownerless(root: string): string[] {
  const map = referrers(root)
  return sheets(root).flatMap((sheet) => {
    const found = map.get(sheet.name) ?? []
    if (found.length >= 2) return []
    const owner = found.at(0)
    if (owner === undefined) return [`${sheet.name}: no component references it`]
    if (dirname(owner) !== dirname(sheet.name) || stem(owner) !== stem(sheet.name)) {
      return [`${sheet.name}: its one referencer (${owner}) is not the sibling with its stem`]
    }
    return []
  })
}

// Rule 3: a reference points at a sibling ('./x.scss') or the directory-shared file one level up
// ('../x.scss'); nothing else, and nothing that does not exist.
function badReferences(root: string): string[] {
  const sheetNames = new Set(sheets(root).map((s) => s.name))
  return sources(root).flatMap((file) =>
    styleReferences(file.text).flatMap((reference) => {
      if (!/^\.{1,2}\/[^/]+\.scss$/.test(reference)) {
        return [
          `${file.name}: references ${reference}, a style reference is './x.scss' or '../x.scss'`,
        ]
      }
      const target = posix(relative(root, resolve(root, dirname(file.name), reference)))
      return sheetNames.has(target)
        ? []
        : [`${file.name}: references ${reference}, which does not exist`]
    }),
  )
}

// Rule 4: no inline `styles:` key, no `ViewEncapsulation.None`, no `::ng-deep`. The line regex is a
// heuristic: it also flags a non-component `styles:` key and misses a key split across lines.
const STYLES_KEY = /\bstyles\s*:/
function inlineStyles(text: string): string[] {
  return text.split('\n').filter((line) => STYLES_KEY.test(line))
}
function encapsulationProblems(root: string): string[] {
  const none = sources(root)
    .filter((file) => file.text.includes('ViewEncapsulation.None'))
    .map((file) => `${file.name}: ViewEncapsulation.None is refused (emulated encapsulation only)`)
  const global = read(join(root, 'styles'), /\.scss$/).map((e) => ({
    name: `styles/${e.name}`,
    text: e.text,
  }))
  const deep = [...sheets(root), ...global]
    .filter((sheet) => sheet.text.includes('::ng-deep'))
    .map((sheet) => `${sheet.name}: ::ng-deep is refused (use an input, :host or :host-context)`)
  const inline = sources(root).flatMap((file) =>
    inlineStyles(file.text).map((line) => `${file.name}: inline ${line.trim()}`),
  )
  return [...none, ...deep, ...inline]
}

// Rule 5: a folder in components/ carries the app- prefix, and its component class carries App.
function unprefixed(root: string): string[] {
  const dir = join(root, 'app/components')
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const problems: string[] = []
      if (!entry.name.startsWith('app-')) {
        problems.push(`app/components/${entry.name}: a folder in components/ starts with app-`)
      }
      for (const file of readdirSync(join(dir, entry.name))) {
        if (!file.endsWith('.component.ts')) continue
        const text = readFileSync(join(dir, entry.name, file), 'utf8')
        const name = /export class (\w+)/.exec(text)?.[1] ?? ''
        if (!name.startsWith('App')) {
          problems.push(`app/components/${entry.name}/${file}: the class ${name} starts with App`)
        }
      }
      return problems
    })
}

// Rule 6: the global tree is layered, the component sheets never are. A global partial holds only
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
const GLOBAL_LAYERS: [path: string, layer: string][] = [
  ['setup/_typography.scss', 'setup'],
  ['themes/_light.scss', 'themes'],
  ['themes/_dark.scss', 'themes'],
  ['basics/_base.scss', 'basics'],
  ['basics/_helpers.scss', 'basics'],
  ['basics/_layout.scss', 'basics'],
]
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
  for (const [path, layer] of GLOBAL_LAYERS) {
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
      problems.push(`${sheet.name}: a component sheet is never layered (unlayered rules win)`)
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

  it('references a stylesheet from a sibling or the directory-shared file only', () => {
    expect(badReferences(REAL_SRC)).toEqual([])
  })

  it('sets no inline styles, no ViewEncapsulation.None and no ::ng-deep', () => {
    expect(encapsulationProblems(REAL_SRC)).toEqual([])
  })

  it('prefixes every folder in components/ with app- and its class with App', () => {
    expect(unprefixed(REAL_SRC)).toEqual([])
  })

  it('layers the global tree and no component sheet', () => {
    expect(layerProblems(REAL_SRC)).toEqual([])
  })
})

describe('the detectors', () => {
  it('flags a decorator that carries inline styles', () => {
    expect(
      inlineStyles("@Component({ selector: 'app-x', styles: ['p { color: red }'] })"),
    ).toHaveLength(1)
  })

  it('accepts a decorator that carries a template and a stylesheet reference', () => {
    expect(
      inlineStyles(
        "@Component({ selector: 'app-x', templateUrl: './x.component.html', styleUrl: './x.component.scss' })",
      ),
    ).toEqual([])
  })

  it('reads styleUrl and a multi-line styleUrls', () => {
    expect(styleReferences("@Component({ styleUrl: './x.component.scss' })")).toEqual([
      './x.component.scss',
    ])
    expect(
      styleReferences(
        "@Component({ styleUrls: [\n './a.component.scss',\n '../controls.scss',\n] })",
      ),
    ).toEqual(['./a.component.scss', '../controls.scss'])
  })
})

describe('the scan itself', () => {
  const roots: string[] = []
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true })
  })

  const LAYERED = (layer: string) => `@layer ${layer} {\n  a {\n    color: red;\n  }\n}\n`
  const component = (name: string, className: string, extra = '') =>
    `import { Component } from '@angular/core'\n\n@Component({\n  selector: '${name}',\n  template: '',\n${extra}})\nexport class ${className} {}\n`
  const RULE = '.x {\n  color: red;\n}\n'

  // A minimal valid tree, with `extra` files added or replaced.
  function seed(extra: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'component-styles-'))
    roots.push(root)
    const files: Record<string, string> = {
      'styles/styles.scss': "@use 'setup/layers';\n@use 'themes';\n",
      'styles/setup/_layers.scss': `${LAYER_ORDER}\n`,
      'styles/setup/_typography.scss': LAYERED('setup'),
      'styles/themes/_light.scss': LAYERED('themes'),
      'styles/themes/_dark.scss': LAYERED('themes'),
      'styles/basics/_base.scss': LAYERED('basics'),
      'styles/basics/_helpers.scss': LAYERED('basics'),
      'styles/basics/_layout.scss': LAYERED('basics'),
      'app/components/app-ok/app-ok.component.ts': component(
        'app-ok',
        'AppOkComponent',
        "  styleUrl: './app-ok.component.scss',\n",
      ),
      'app/components/app-ok/app-ok.component.scss': RULE,
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
    expect(badReferences(root)).toEqual([])
    expect(encapsulationProblems(root)).toEqual([])
    expect(unprefixed(root)).toEqual([])
    expect(layerProblems(root)).toEqual([])
  })

  it('refuses a stylesheet no component references', () => {
    const root = seed({ 'app/pages/x/orphan.scss': RULE })

    expect(ownerless(root)).toEqual(['app/pages/x/orphan.scss: no component references it'])
  })

  it('accepts a sheet that two sibling components reference', () => {
    const root = seed({
      'app/shared/components/controls.scss': RULE,
      'app/shared/components/input/input.component.ts': component(
        'app-input',
        'InputComponent',
        "  styleUrls: ['../controls.scss'],\n",
      ),
      'app/shared/components/textarea/textarea.component.ts': component(
        'app-textarea',
        'TextareaComponent',
        "  styleUrls: ['../controls.scss'],\n",
      ),
    })

    expect(ownerless(root)).toEqual([])
    expect(badReferences(root)).toEqual([])
  })

  it('refuses a shared sheet that only one component references', () => {
    const root = seed({
      'app/shared/components/controls.scss': RULE,
      'app/shared/components/input/input.component.ts': component(
        'app-input',
        'InputComponent',
        "  styleUrls: ['../controls.scss'],\n",
      ),
    })

    expect(ownerless(root)).toEqual([
      'app/shared/components/controls.scss: its one referencer (app/shared/components/input/input.component.ts) is not the sibling with its stem',
    ])
  })

  it('refuses a sheet whose one referencer has another stem', () => {
    const root = seed({
      'app/pages/x/x.component.ts': component(
        'app-x',
        'XComponent',
        "  styleUrl: './other.component.scss',\n",
      ),
      'app/pages/x/other.component.scss': RULE,
    })

    expect(ownerless(root)).toEqual([
      'app/pages/x/other.component.scss: its one referencer (app/pages/x/x.component.ts) is not the sibling with its stem',
    ])
  })

  it('refuses a reference that leaves the sibling or the shared directory', () => {
    const root = seed({
      'app/pages/x/x.component.ts': component(
        'app-x',
        'XComponent',
        "  styleUrls: ['../../y/other.scss', './missing.scss', '/abs.scss'],\n",
      ),
    })

    expect(badReferences(root)).toEqual([
      "app/pages/x/x.component.ts: references ../../y/other.scss, a style reference is './x.scss' or '../x.scss'",
      'app/pages/x/x.component.ts: references ./missing.scss, which does not exist',
      "app/pages/x/x.component.ts: references /abs.scss, a style reference is './x.scss' or '../x.scss'",
    ])
  })

  it('refuses an inline styles key', () => {
    const root = seed({
      'app/pages/x/x.component.ts': component(
        'app-x',
        'XComponent',
        "  styles: ['p { color: red }'],\n",
      ),
    })

    expect(encapsulationProblems(root)).toEqual([
      "app/pages/x/x.component.ts: inline styles: ['p { color: red }'],",
    ])
  })

  it('refuses ::ng-deep in a sheet', () => {
    const root = seed({
      'app/components/app-ok/app-ok.component.scss': ':host ::ng-deep p {\n  color: red;\n}\n',
    })

    expect(encapsulationProblems(root)).toEqual([
      'app/components/app-ok/app-ok.component.scss: ::ng-deep is refused (use an input, :host or :host-context)',
    ])
  })

  it('refuses ViewEncapsulation.None', () => {
    const root = seed({
      'app/pages/x/x.component.ts': component(
        'app-x',
        'XComponent',
        '  encapsulation: ViewEncapsulation.None,\n',
      ),
    })

    expect(encapsulationProblems(root)).toEqual([
      'app/pages/x/x.component.ts: ViewEncapsulation.None is refused (emulated encapsulation only)',
    ])
  })

  it('refuses a folder in components/ without the app- prefix', () => {
    const root = seed({
      'app/components/thing/thing.component.ts': component('app-thing', 'AppThingComponent'),
    })

    expect(unprefixed(root)).toEqual([
      'app/components/thing: a folder in components/ starts with app-',
    ])
  })

  it('refuses a component class in components/ without the App prefix', () => {
    const root = seed({
      'app/components/app-thing/app-thing.component.ts': component('app-thing', 'ThingComponent'),
    })

    expect(unprefixed(root)).toEqual([
      'app/components/app-thing/app-thing.component.ts: the class ThingComponent starts with App',
    ])
  })

  it('refuses a global partial whose rules are not in their layer', () => {
    const root = seed({ 'styles/basics/_layout.scss': 'a {\n  color: red;\n}\n' })

    expect(layerProblems(root)).toEqual([
      'styles/basics/_layout.scss: its rules are not in @layer basics { }',
    ])
  })

  it('refuses a layered component sheet', () => {
    const root = seed({ 'app/components/app-ok/app-ok.component.scss': LAYERED('basics') })

    expect(layerProblems(root)).toEqual([
      'app/components/app-ok/app-ok.component.scss: a component sheet is never layered (unlayered rules win)',
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

  it('refuses a styles.scss that does not load the layer order first', () => {
    const root = seed({ 'styles/styles.scss': "@use 'themes';\n@use 'setup/layers';\n" })

    expect(layerProblems(root)).toEqual([
      "styles/styles.scss: the first @use is @use 'themes';, expected @use 'setup/layers';",
    ])
  })

  it('accepts @use lines, comments and the one layer block at the top of a global partial', () => {
    const root = seed({
      'styles/basics/_layout.scss': `@use '../setup/functions';\n\n// What this holds.\n/* A block\n   comment { with braces } */\n${LAYERED('basics')}`,
    })

    expect(layerProblems(root)).toEqual([])
  })

  it('shows a fifth entry in src/styles/', () => {
    const root = seed({ 'styles/components/_x.scss': RULE })

    expect(stylesEntries(root)).toEqual(['basics', 'components', 'setup', 'styles.scss', 'themes'])
  })
})
