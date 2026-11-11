// @vitest-environment node
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

// The folder rules for src/. Each rule is a pure function over a root directory, so it runs on
// src/ and on a seeded temporary tree.
//   1. models/ holds one folder per entity, and in it only interface.ts, type.ts, enum.ts, constant.ts.
//   2. A component of two or more files (base-modal.vue, base-modal.scss, ...) is a folder named for it.
//   3. One folder is named components: shared/components/. The app chrome is layout/.
const REAL_SRC = fileURLToPath(new URL('../../src', import.meta.url))

const posix = (path: string) => path.split(sep).join('/')

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : walk(path)
    return [path]
  })
}

function directories(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'generated')
    .flatMap((entry) => [join(dir, entry.name), ...directories(join(dir, entry.name))])
}

const files = (root: string, under: string) => {
  try {
    return walk(join(root, under)).map((p) => posix(relative(root, p)))
  } catch {
    return []
  }
}

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
// belong in a folder of that name. In app/ only a stem that has a .vue file counts (router.ts
// and router.spec.ts are wiring, not a component).
function stemProblems(root: string): string[] {
  const dirs = new Map<string, boolean>()
  for (const base of ['layout', 'shared/components', 'pages']) {
    for (const name of files(root, base)) dirs.set(dirname(name), false)
  }
  for (const name of files(root, 'app')) dirs.set(dirname(name), true)
  const problems: string[] = []
  for (const [dir, vueOnly] of dirs) {
    const names = readdirSync(join(root, dir), { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name)
    const byStem = new Map<string, string[]>()
    for (const name of names) {
      const stem = name.split('.')[0] ?? name
      byStem.set(stem, [...(byStem.get(stem) ?? []), name])
    }
    for (const [stem, group] of byStem) {
      if (vueOnly && !group.some((name) => name.endsWith('.vue'))) continue
      if (group.length >= 2 && basename(dir) !== stem) {
        problems.push(
          `${dir}/${group[0] ?? ''}: ${group.join(', ')} share a stem, put them in ${stem}/`,
        )
      }
    }
  }
  return problems.sort()
}

// Rule 3: a folder named components is shared/components/, nowhere else.
const strayComponents = (root: string) =>
  directories(root)
    .map((dir) => posix(relative(root, dir)))
    .filter((dir) => basename(dir) === 'components' && dir !== 'shared/components')
    .sort()

describe('the folder rules', () => {
  it('scans the real tree', () => {
    expect(files(REAL_SRC, 'models').length).toBeGreaterThan(0)
    expect(files(REAL_SRC, 'shared/components').length).toBeGreaterThan(10)
    expect(files(REAL_SRC, 'layout').length).toBeGreaterThan(0)
  })

  it('keeps one entity folder of known files in models/', () => {
    expect(modelProblems(REAL_SRC)).toEqual([])
  })

  it('puts a component of several files in a folder named for it', () => {
    expect(stemProblems(REAL_SRC)).toEqual([])
  })

  it('has no components/ folder but shared/components/', () => {
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
      'layout/app-menu/app-menu.vue': '\n',
      'layout/app-menu/app-menu.scss': '\n',
      'layout/app-menu/app-menu.spec.ts': 'export {}\n',
      'layout/app-lone/app-lone.vue': '\n',
      'shared/components/base-button/base-button.vue': '\n',
      'shared/components/base-button/base-button.spec.ts': 'export {}\n',
      'shared/components/form/base-input.vue': '\n',
      'shared/components/icons.ts': 'export {}\n',
      'pages/post/post.routes.ts': 'export {}\n',
      'pages/post/post.routes.spec.ts': 'export {}\n',
      'pages/post/post-page/post-page.vue': '\n',
      'pages/post/post-page/post-page.scss': '\n',
      'pages/post/post-badge.vue': '\n',
      'app/App.vue': '\n',
      'app/router.ts': 'export {}\n',
      'app/router.spec.ts': 'export {}\n',
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
      'models/user/type.ts': 'export {}\n',
    })
    expect(modelProblems(root)).toEqual([
      'models/OrderLine/type.ts: models/ holds <entity>/interface.ts, type.ts, enum.ts or constant.ts only',
      'models/user.ts: models/ holds <entity>/interface.ts, type.ts, enum.ts or constant.ts only',
      'models/user/schema.ts: models/ holds <entity>/interface.ts, type.ts, enum.ts or constant.ts only',
      'models/user/type.spec.ts: models/ holds <entity>/interface.ts, type.ts, enum.ts or constant.ts only',
    ])
  })

  it('refuses two files of one stem outside a folder of that name', () => {
    const root = seed({
      'layout/app-menu.vue': '\n',
      'layout/app-menu.scss': '\n',
      'shared/components/badge.vue': '\n',
      'shared/components/badge.spec.ts': 'export {}\n',
      'pages/post/post-page.vue': '\n',
      'pages/post/post-page.scss': '\n',
      'app/Shell.vue': '\n',
      'app/Shell.spec.ts': 'export {}\n',
    })
    expect(stemProblems(root)).toEqual([
      'app/Shell.spec.ts: Shell.spec.ts, Shell.vue share a stem, put them in Shell/',
      'layout/app-menu.scss: app-menu.scss, app-menu.vue share a stem, put them in app-menu/',
      'pages/post/post-page.scss: post-page.scss, post-page.vue share a stem, put them in post-page/',
      'shared/components/badge.spec.ts: badge.spec.ts, badge.vue share a stem, put them in badge/',
    ])
  })

  it('refuses a components/ folder at the top and under pages/', () => {
    const root = seed({
      'components/app-x.vue': '\n',
      'pages/post/components/post-badge.vue': '\n',
      'shared/components/icons.ts': 'export {}\n',
    })
    expect(strayComponents(root)).toEqual(['components', 'pages/post/components'])
  })
})
