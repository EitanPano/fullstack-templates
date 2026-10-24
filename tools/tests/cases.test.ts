import { describe, expect, test } from 'bun:test'
import { loadCatalog } from '../lib/catalog'
import { listCases, requestFor } from '../lib/cases'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { FIXTURE, copyFixture } from './helpers'

describe('cases', () => {
  test('lists every case with a stable id', () => {
    expect(listCases(loadCatalog(FIXTURE)).map((c) => c.id)).toEqual([
      'frontend/mini-spa/alone',
      'frontend/mini-spa/default',
      'frontend/mini-ui/alone',
      'frontend/mini-ui/default',
      'server/mini-py/auth-off',
      'server/mini-py/default',
      'server/mini/auth-off',
      'server/mini/auth-off-fake',
      'server/mini/default',
      'server/mini/fake',
    ])
  })
  test('builds a stack request with package-qualified flags and a template request with shorthands', () => {
    const cases = listCases(loadCatalog(FIXTURE))
    const front = requestFor(
      cases.find((c) => c.id === 'frontend/mini-ui/default')!,
      'out',
    )
    expect(front.stack).toBe('mini')
    expect(front.template).toBeUndefined()
    expect(front.answers?.packages).toEqual({ frontend: { flags: {}, capabilities: {} } })
    expect(front.name).toBe('demo')
    expect(front.skipPostGenerate).toBe(false)
    const off = requestFor(
      cases.find((c) => c.id === 'server/mini/auth-off')!,
      'out',
    )
    expect(off.template).toBe('server/mini')
    expect(off.stack).toBeUndefined()
    expect(off.flags).toEqual(['auth=false'])
    expect(off.capabilities).toEqual([])
  })
  describe('withApp', () => {
    const withValue = (value: string) => {
      const root = copyFixture('catalog')
      const file = path.join(root, 'server/mini/tests/cases.yaml')
      const text = readFileSync(file, 'utf8')
      writeFileSync(
        file,
        text.replace('  - name: default\n', `  - name: default\n    withApp: ${value}\n`),
      )
      return root
    }
    test('is accepted as a boolean and defaults to false', () => {
      const cases = listCases(loadCatalog(withValue('true')))
      expect(cases.find((c) => c.id === 'server/mini/default')?.withApp).toBe(true)
      expect(cases.find((c) => c.id === 'server/mini/fake')?.withApp).toBe(false)
    })
    test('a non-boolean is refused', () => {
      expect(() => loadCatalog(withValue('"yes"'))).toThrow(/withApp/)
    })
  })
})
