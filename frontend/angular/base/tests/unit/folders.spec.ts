// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

// The folder rules for src/app/. Each rule is a pure function over a root directory, so it runs on
// src/app/ and on a seeded temporary tree.
//   1. models/ holds one folder per entity, and in it only interface.ts, type.ts, enum.ts, constant.ts.
//   2. A component of two or more files (checkbox.component.ts, .html, .scss, .spec.ts) is a folder
//      named for it.
//   3. There is one components folder: shared/components/. The chrome is layout/, and a page's own
//      components sit in its folder, so no components/ exists elsewhere.
const REAL_APP = fileURLToPath(new URL('../../src/app', import.meta.url))

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
// belong in a folder of that name. Scanned: layout/, shared/components/, pages/ and the files
// directly in app/ (whose folder is named app).
function stemProblems(root: string): string[] {
  const dirs = new Set<string>(['app'])
  for (const base of ['layout', 'shared/components', 'pages']) {
    for (const name of files(root, base)) dirs.add(dirname(name))
  }
  const problems: string[] = []
  for (const dir of dirs) {
    const path = dir === 'app' ? root : join(root, dir)
    const inDir = readdirSync(path, { withFileTypes: true }).filter((e) => e.isFile())
    const byStem = new Map<string, string[]>()
    for (const { name } of inDir) {
      const stem = name.split('.')[0] ?? name
      byStem.set(stem, [...(byStem.get(stem) ?? []), name])
    }
    const owner = dir === 'app' ? 'app' : basename(dir)
    for (const [stem, names] of byStem) {
      if (names.length >= 2 && owner !== stem) {
        const where = dir === 'app' ? '' : `${dir}/`
        problems.push(
          `${where}${names[0] ?? ''}: ${names.join(', ')} share a stem, put them in ${stem}/`,
        )
      }
    }
  }
  return problems.sort()
}

// Rule 3: shared/components/ is the only folder named components.
const strayComponents = (root: string) =>
  [...new Set(files(root, '').map((name) => dirname(name)))]
    .filter((dir) => dir.split('/').includes('components') && !dir.startsWith('shared/components'))
    .sort()

describe('the folder rules', () => {
  it('scans the real tree', () => {
    expect(files(REAL_APP, 'models').length).toBeGreaterThan(0)
    expect(files(REAL_APP, 'shared/components').length).toBeGreaterThan(10)
  })

  it('keeps one entity folder of known files in models/', () => {
    expect(modelProblems(REAL_APP)).toEqual([])
  })

  it('puts a component of several files in a folder named for it', () => {
    expect(stemProblems(REAL_APP)).toEqual([])
  })

  it('has no components/ folder outside shared/ (the chrome is in layout/)', () => {
    expect(strayComponents(REAL_APP)).toEqual([])
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
      'app.component.ts': 'export {}\n',
      'app.routes.ts': 'export {}\n',
      'models/user/type.ts': 'export {}\n',
      'models/order-line/interface.ts': 'export {}\n',
      'layout/app-menu/app-menu.component.ts': 'export {}\n',
      'layout/app-menu/app-menu.component.scss': '\n',
      'shared/components/button/button.component.ts': 'export {}\n',
      'shared/components/button/button.component.spec.ts': 'export {}\n',
      'shared/components/form/input/input.component.ts': 'export {}\n',
      'shared/components/form/controls.scss': '\n',
      'pages/post/post.routes.ts': 'export {}\n',
      'pages/post/post.form.ts': 'export {}\n',
      'pages/post/list/list.component.ts': 'export {}\n',
      'pages/post/list/list.component.scss': '\n',
      'pages/post/list/post-card/post-card.component.ts': 'export {}\n',
      'pages/post/list/post-card/post-card.component.scss': '\n',
    })
    expect(modelProblems(root)).toEqual([])
    expect(stemProblems(root)).toEqual([])
    expect(strayComponents(root)).toEqual([])
  })

  it('refuses a file in models/ that is not an entity file', () => {
    const root = seed({
      'models/user.ts': 'export {}\n',
      'models/user/schema.ts': 'export {}\n',
      'models/user/type.spec.ts': 'export {}\n',
      'models/OrderLine/type.ts': 'export {}\n',
      'models/user/constants.ts': 'export {}\n',
      'models/user/type.ts': 'export {}\n',
    })
    expect(modelProblems(root)).toEqual([
      'models/OrderLine/type.ts: models/ holds <entity>/interface.ts, type.ts, enum.ts or constant.ts only',
      'models/user.ts: models/ holds <entity>/interface.ts, type.ts, enum.ts or constant.ts only',
      'models/user/constants.ts: models/ holds <entity>/interface.ts, type.ts, enum.ts or constant.ts only',
      'models/user/schema.ts: models/ holds <entity>/interface.ts, type.ts, enum.ts or constant.ts only',
      'models/user/type.spec.ts: models/ holds <entity>/interface.ts, type.ts, enum.ts or constant.ts only',
    ])
  })

  it('refuses two files of one stem outside a folder of that name', () => {
    const root = seed({
      'layout/app-menu.component.ts': 'export {}\n',
      'layout/app-menu.component.scss': '\n',
      'shared/components/modal/modal.component.ts': 'export {}\n',
      'shared/components/modal/confirm-dialog.component.ts': 'export {}\n',
      'shared/components/modal/confirm-dialog.component.html': '\n',
      'pages/post/list/post-card.component.ts': 'export {}\n',
      'pages/post/list/post-card.component.scss': '\n',
    })
    expect(stemProblems(root)).toEqual([
      'layout/app-menu.component.scss: app-menu.component.scss, app-menu.component.ts share a stem, put them in app-menu/',
      'pages/post/list/post-card.component.scss: post-card.component.scss, post-card.component.ts share a stem, put them in post-card/',
      'shared/components/modal/confirm-dialog.component.html: confirm-dialog.component.html, confirm-dialog.component.ts share a stem, put them in confirm-dialog/',
    ])
  })

  it('refuses a components/ folder outside shared/', () => {
    const root = seed({
      'components/app-x/app-x.component.ts': 'export {}\n',
      'pages/post/components/post-card/post-card.component.ts': 'export {}\n',
      'shared/components/button/button.component.ts': 'export {}\n',
    })
    expect(strayComponents(root)).toEqual(['components/app-x', 'pages/post/components/post-card'])
  })
})
