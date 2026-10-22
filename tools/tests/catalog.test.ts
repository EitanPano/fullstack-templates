import { describe, expect, test } from 'bun:test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { CatalogError, loadCatalog } from '../lib/catalog'
import { copyFixture, FIXTURE } from './helpers'

function edit(root: string, file: string, change: (text: string) => string): void {
  const target = path.join(root, file)
  writeFileSync(target, change(readFileSync(target, 'utf8')))
}

function problems(root: string): string {
  try {
    loadCatalog(root)
  } catch (error) {
    if (error instanceof CatalogError) return error.message
    throw error
  }
  throw new Error('expected a CatalogError')
}

describe('loadCatalog', () => {
  test('loads templates and stacks keyed by path and id', () => {
    const catalog = loadCatalog(FIXTURE)
    expect([...catalog.templates.keys()].sort()).toEqual(['frontend/mini-ui', 'server/mini'])
    expect(catalog.templates.get('server/mini')?.manifest.flags?.auth?.default).toBe(true)
    expect(catalog.stacks.get('mini')?.manifest.packages.map((p) => p.dir)).toEqual([
      'backend',
      'frontend',
    ])
  })

  test('loads each template cases file', () => {
    const catalog = loadCatalog(FIXTURE)
    expect(catalog.templates.get('server/mini')?.cases.cases.map((c) => c.name)).toEqual([
      'default',
      'auth-off',
    ])
  })

  test('reports a listed template whose directory is missing', () => {
    expect(() => loadCatalog(path.join(import.meta.dir, 'fixtures', 'broken-index'))).toThrow(
      CatalogError,
    )
  })

  test('reports an index entry whose version differs from the manifest', () => {
    const root = copyFixture('catalog')
    edit(root, 'index.yaml', (t) => t.replace('version: 1.0.0', 'version: 9.9.9'))
    const message = problems(root)
    expect(message).toContain('server/mini')
    expect(message).toContain('version')
  })

  test('reports an onlyPath that does not exist in base', () => {
    const root = copyFixture('catalog')
    edit(root, 'server/mini/template.yaml', (t) =>
      t.replace('tests/auth.test.ts]', 'tests/auth.test.ts, src/missing.ts]'),
    )
    expect(problems(root)).toContain('src/missing.ts')
  })

  test('reports a template directory on disk that the index does not list', () => {
    const root = copyFixture('catalog')
    mkdirSync(path.join(root, 'server', 'orphan'))
    writeFileSync(path.join(root, 'server', 'orphan', 'template.yaml'), 'schemaVersion: 1\n')
    expect(problems(root)).toContain('server/orphan')
  })

  test('reports a case flag the template does not declare', () => {
    const root = copyFixture('catalog')
    edit(root, 'server/mini/tests/cases.yaml', (t) => t.replace('auth: false', 'oauth: false'))
    expect(problems(root)).toContain('oauth')
  })

  test('reports a case stack that is not a loaded stack', () => {
    const root = copyFixture('catalog')
    edit(root, 'frontend/mini-ui/tests/cases.yaml', (t) => t.replace('stack: mini', 'stack: nope'))
    expect(problems(root)).toContain('nope')
  })

  test('reports a missing shared file', () => {
    const root = copyFixture('catalog')
    edit(root, 'server/mini/template.yaml', (t) =>
      t.replace('gitignore: [node]', 'gitignore: [go]'),
    )
    expect(problems(root)).toContain('shared/gitignore/go.gitignore')
  })
})
