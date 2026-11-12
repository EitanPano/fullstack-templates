// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

// The folder rules for src/. Each rule is a pure function over a root directory, so it runs on
// src/ and on a seeded temporary tree.
//   1. models/ holds one folder per entity, and in it only interface.ts, type.ts, enum.ts, constant.ts.
//   2. A component of two or more files (checkbox.tsx, checkbox.scss, ...) is a folder named for it.
//   3. There is one components folder, shared/components/: the chrome is layout/, and a page's own
//      components sit in the page's folder.
const REAL_SRC = fileURLToPath(new URL('../../src', import.meta.url))

const posix = (path: string) => path.split(sep).join('/')

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : walk(path)
    return [path]
  })
}

const files = (root: string, under: string) =>
  existsSync(join(root, under)) ? walk(join(root, under)).map((p) => posix(relative(root, p))) : []

// Rule 1.
const ENTITY_FILE = /^models\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*\/(?:interface|type|enum|constant)\.ts$/
function modelProblems(root: string): string[] {
  return files(root, 'models')
    .filter((name) => !ENTITY_FILE.test(name))
    .sort()
    .map(
      (name) =>
        `${name}: models/ holds <entity>/interface.ts, type.ts, enum.ts or constant.ts only`,
    )
}

// Rule 2: the stem is the name up to its first dot. Two files in one folder with the same stem
// belong in a folder of that name. A route table, a form schema and a copy table
// (routes.tsx, <module>.routes.tsx, <module>.form.ts, <module>.copy.ts) are the module's wiring,
// not components, so they are left out.
const WIRING = /^(?:routes\.|[^/]*\.(?:routes|form|copy)\.)/
function stemProblems(root: string): string[] {
  const dirs = new Set<string>()
  for (const base of ['app', 'layout', 'pages', 'shared/components']) {
    for (const name of files(root, base)) dirs.add(dirname(name))
  }
  const problems: string[] = []
  for (const dir of dirs) {
    const inDir = readdirSync(join(root, dir), { withFileTypes: true }).filter(
      (e) => e.isFile() && !WIRING.test(e.name),
    )
    const byStem = new Map<string, string[]>()
    for (const { name } of inDir) {
      const stem = name.split('.')[0] ?? name
      byStem.set(stem, [...(byStem.get(stem) ?? []), name])
    }
    for (const [stem, names] of byStem) {
      if (names.length >= 2 && basename(dir) !== stem) {
        problems.push(
          `${dir}/${names[0] ?? ''}: ${names.join(', ')} share a stem, put them in ${stem}/`,
        )
      }
    }
  }
  return problems.sort()
}

// Rule 3: a folder named components exists once, as shared/components.
function strayComponents(root: string): string[] {
  const dirs = new Set<string>()
  for (const name of files(root, '')) {
    const parts = name.split('/').slice(0, -1)
    parts.forEach((part, at) => {
      if (part === 'components') dirs.add(parts.slice(0, at + 1).join('/'))
    })
  }
  return [...dirs].filter((dir) => dir !== 'shared/components').sort()
}

describe('the folder rules', () => {
  it('scans the real tree', () => {
    expect(files(REAL_SRC, 'models').length).toBeGreaterThan(0)
    expect(files(REAL_SRC, 'shared/components').length).toBeGreaterThan(10)
  })

  it('keeps one entity folder of known files in models/', () => {
    expect(modelProblems(REAL_SRC)).toEqual([])
  })

  it('puts a component of several files in a folder named for it', () => {
    expect(stemProblems(REAL_SRC)).toEqual([])
  })

  it('has one components folder, shared/components (the chrome is in layout/)', () => {
    expect(strayComponents(REAL_SRC)).toEqual([])
  })
})

describe('the scan itself', () => {
  const roots: string[] = []
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true })
  })

  function seed(tree: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'folders-'))
    roots.push(root)
    for (const [name, text] of Object.entries(tree)) {
      mkdirSync(dirname(join(root, name)), { recursive: true })
      writeFileSync(join(root, name), text)
    }
    return root
  }

  it('accepts a valid tree', () => {
    const root = seed({
      'models/user/type.ts': 'export {}\n',
      'models/order-line/interface.ts': 'export {}\n',
      'app/routes.tsx': 'export {}\n',
      'app/routes.test.tsx': 'export {}\n',
      'app/root-error/root-error.tsx': 'export {}\n',
      'app/root-error/root-error.scss': '\n',
      'layout/app-menu/app-menu.tsx': 'export {}\n',
      'layout/app-menu/app-menu.scss': '\n',
      'layout/app-sign-out-item.tsx': 'export {}\n',
      'shared/components/button/button.tsx': 'export {}\n',
      'shared/components/button/button.test.tsx': 'export {}\n',
      'shared/components/form/input.tsx': 'export {}\n',
      'pages/post/post.routes.tsx': 'export {}\n',
      'pages/post/post.routes.test.tsx': 'export {}\n',
      'pages/post/post.form.ts': 'export {}\n',
      'pages/post/post.copy.ts': 'export {}\n',
      'pages/post/post-page/post-page.tsx': 'export {}\n',
      'pages/post/post-page/post-page.scss': '\n',
      'pages/post/post-card/post-card.tsx': 'export {}\n',
      'pages/post/post-card/post-card.test.tsx': 'export {}\n',
      'pages/post/sign-out-button.tsx': 'export {}\n',
    })
    expect(modelProblems(root)).toEqual([])
    expect(stemProblems(root)).toEqual([])
    expect(strayComponents(root)).toEqual([])
  })

  it('refuses a file in models/ that is not an entity file', () => {
    const root = seed({
      'models/user.ts': 'export {}\n',
      'models/user/schema.ts': 'export {}\n',
      'models/user/type.test.ts': 'export {}\n',
      'models/OrderLine/type.ts': 'export {}\n',
      'models/user/type.ts': 'export {}\n',
    })
    expect(modelProblems(root)).toEqual([
      'models/OrderLine/type.ts: models/ holds <entity>/interface.ts, type.ts, enum.ts or constant.ts only',
      'models/user.ts: models/ holds <entity>/interface.ts, type.ts, enum.ts or constant.ts only',
      'models/user/schema.ts: models/ holds <entity>/interface.ts, type.ts, enum.ts or constant.ts only',
      'models/user/type.test.ts: models/ holds <entity>/interface.ts, type.ts, enum.ts or constant.ts only',
    ])
  })

  it('refuses two files of one stem outside a folder of that name', () => {
    const root = seed({
      'app/root-error.tsx': 'export {}\n',
      'app/root-error.scss': '\n',
      'layout/app-menu.tsx': 'export {}\n',
      'layout/app-menu.scss': '\n',
      'shared/components/checkbox/checkbox.tsx': 'export {}\n',
      'shared/components/checkbox/checkbox.test.tsx': 'export {}\n',
      'shared/components/badge.tsx': 'export {}\n',
      'shared/components/badge.test.tsx': 'export {}\n',
      'pages/post/post-page.tsx': 'export {}\n',
      'pages/post/post-page.scss': '\n',
      'pages/post/post.routes.tsx': 'export {}\n',
      'pages/post/post.routes.test.tsx': 'export {}\n',
    })
    expect(stemProblems(root)).toEqual([
      'app/root-error.scss: root-error.scss, root-error.tsx share a stem, put them in root-error/',
      'layout/app-menu.scss: app-menu.scss, app-menu.tsx share a stem, put them in app-menu/',
      'pages/post/post-page.scss: post-page.scss, post-page.tsx share a stem, put them in post-page/',
      'shared/components/badge.test.tsx: badge.test.tsx, badge.tsx share a stem, put them in badge/',
    ])
  })

  it('refuses a components folder other than shared/components', () => {
    const root = seed({
      'components/app-x.tsx': 'export {}\n',
      'pages/post/components/post-card.tsx': 'export {}\n',
      'shared/components/button/button.tsx': 'export {}\n',
    })
    expect(strayComponents(root)).toEqual(['components', 'pages/post/components'])
  })
})
