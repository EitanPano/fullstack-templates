import { describe, expect, test } from 'bun:test'
import { readFileSync, writeFileSync } from 'node:fs'
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
