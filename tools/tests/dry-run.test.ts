import { describe, expect, test } from 'bun:test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadCatalog } from '../lib/catalog'
import { dryRunMarkers } from '../lib/dry-run'
import { copyFixture } from './helpers'

function setup(files: Record<string, string>, id: string) {
  const root = copyFixture('catalog')
  for (const [rel, content] of Object.entries(files)) writeFileSync(path.join(root, rel), content)
  const template = loadCatalog(root).templates.get(id)
  if (template === undefined) throw new Error(`no template ${id}`)
  return template
}

describe('dryRunMarkers', () => {
  test('is clean on the fixture', () => {
    expect(dryRunMarkers(setup({}, 'server/mini'))).toEqual([])
  })

  test('reports a leftover marker that applyMarkers cannot remove', () => {
    const template = setup({ 'server/mini/base/src/left.ts': 'x # @auth\n' }, 'server/mini')
    expect(dryRunMarkers(template)).toContain('base/src/left.ts: leftover marker # @auth')
  })

  test('reports a marker or a placeholder in a file of an unlisted type', () => {
    const template = setup(
      {
        'server/mini/base/src/a.zzz': 'x // @auth\n',
        'server/mini/base/src/b.zzz': 'x __PROJECT_NAME__\n',
      },
      'server/mini',
    )
    const problems = dryRunMarkers(template)
    expect(problems.some((p) => p.startsWith('base/src/a.zzz: holds marker // @auth'))).toBe(true)
    expect(problems.some((p) => p.includes('b.zzz: holds placeholder __PROJECT_NAME__'))).toBe(true)
  })

  test('finds a problem that only appears when a flag is on', () => {
    const template = setup(
      { 'server/mini/base/src/on.ts': '// @auth-start\nx // @bogus\n// @auth-end\n' },
      'server/mini',
    )
    const problems = dryRunMarkers(template)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('on.ts:2')
  })

  test('reports a problem shared by every combination once', () => {
    const template = setup({ 'server/mini/base/src/all.ts': 'x // @bogus\n' }, 'server/mini')
    expect(dryRunMarkers(template).filter((p) => p.includes('all.ts:1'))).toHaveLength(1)
  })

  test('still runs one pass for a template without flags', () => {
    const template = setup(
      { 'frontend/mini-ui/base/src/bad.ts': 'x // @bogus\n' },
      'frontend/mini-ui',
    )
    expect(template.manifest.flags).toBeUndefined()
    expect(dryRunMarkers(template).some((p) => p.includes('bad.ts:1'))).toBe(true)
  })

  test('checks compose.yaml with its own path', () => {
    const root = copyFixture('catalog')
    const file = path.join(root, 'server/mini/compose.yaml')
    writeFileSync(file, `${readFileSync(file, 'utf8')}x: 1 # @bogus\n`)
    const template = loadCatalog(root).templates.get('server/mini')
    if (template === undefined) throw new Error('no template')
    expect(dryRunMarkers(template).some((p) => p.startsWith('compose.yaml:'))).toBe(true)
  })
})

describe('dryRunMarkers with the reserved single', () => {
  test('accepts @single and @nosingle, line and block form, in a base file', () => {
    const content = [
      'a // @single',
      'b // @nosingle',
      '// @single-start',
      'c',
      '// @single-end',
      '// @nosingle-start',
      'd',
      '// @nosingle-end',
      '',
    ].join('\n')
    const template = setup({ 'server/mini/base/src/m.ts': content }, 'server/mini')
    expect(dryRunMarkers(template)).toEqual([])
  })

  test('a problem only inside a single block is found, once', () => {
    const content = '// @single-start\nx // @bogus\n// @single-end\n'
    const template = setup({ 'server/mini/base/src/m.ts': content }, 'server/mini')
    expect(dryRunMarkers(template).filter((p) => p.includes('m.ts:2'))).toHaveLength(1)
  })
})

describe('dryRunMarkers with capabilities', () => {
  const OVERLAY = 'server/mini/capabilities/database/fake/overlay/src'
  const OVERLAY_PATH = 'capabilities/database/fake/overlay/src'

  test('reports an unbalanced block inside an overlay file with its overlay path', () => {
    const template = setup({ [`${OVERLAY}/x.ts`]: '// @auth-start\nx\n' }, 'server/mini')
    expect(dryRunMarkers(template)).toContain(
      `${OVERLAY_PATH}/x.ts:1: marker block is never closed`,
    )
  })

  test('reports an unknown marker name in an overlay file', () => {
    const template = setup({ [`${OVERLAY}/x.ts`]: 'x // @bogus\n' }, 'server/mini')
    expect(dryRunMarkers(template)).toContain(`${OVERLAY_PATH}/x.ts:1: unknown marker name "bogus"`)
  })

  test('accepts a marker that only the provider selection defines, in a base file', () => {
    const template = setup(
      { 'server/mini/base/src/p.ts': 'a // @database:fake\nb // @nodatabase:fake\n' },
      'server/mini',
    )
    expect(dryRunMarkers(template)).toEqual([])
  })

  test('reports an unknown provider in a base file', () => {
    const template = setup({ 'server/mini/base/src/p.ts': 'a // @database:nope\n' }, 'server/mini')
    expect(dryRunMarkers(template).some((p) => p.includes('base/src/p.ts:1'))).toBe(true)
  })

  test('does not check a base file the overlay replaces under that provider', () => {
    // Only evaluated when a database is selected; the overlay's own src/index.ts replaces this copy.
    const broken = '// @database-start\nx // @bogus\n// @database-end\n'
    const shadowed = setup({ 'server/mini/base/src/index.ts': broken }, 'server/mini')
    expect(dryRunMarkers(shadowed)).toEqual([])
    const kept = setup({ 'server/mini/base/src/other.ts': broken }, 'server/mini')
    expect(dryRunMarkers(kept)).toContain('base/src/other.ts:2: unknown marker name "bogus"')
  })

  test('takes -- markers in an overlay .sql file', () => {
    const template = setup(
      {
        [`${OVERLAY}/init.sql`]:
          'select 1 -- @auth\n-- @database:fake-start\nx\n-- @database:fake-end\n',
      },
      'server/mini',
    )
    expect(dryRunMarkers(template)).toEqual([])
    const bad = setup({ [`${OVERLAY}/init.sql`]: 'select 1 -- @bogus\n' }, 'server/mini')
    expect(dryRunMarkers(bad)).toContain(`${OVERLAY_PATH}/init.sql:1: unknown marker name "bogus"`)
  })
})

describe('dryRunMarkers ignores local state', () => {
  test('does not scan a .venv under base', () => {
    const root = copyFixture('catalog')
    const venv = path.join(root, 'server/mini-py/base/.venv/lib')
    mkdirSync(venv, { recursive: true })
    writeFileSync(path.join(venv, 'leak.py'), 'x = 1  # @bogus\n')
    const template = loadCatalog(root).templates.get('server/mini-py')
    if (template === undefined) throw new Error('no template')
    expect(dryRunMarkers(template)).toEqual([])
  })
})
