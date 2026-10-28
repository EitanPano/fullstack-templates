import { describe, expect, test } from 'bun:test'
import { loadCatalog } from '../lib/catalog'
import { listCases, requestFor } from '../lib/cases'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { generate } from '../lib/generate'
import { resolveRequest } from '../lib/plan'
import { FIXTURE, copyFixture, tempDir } from './helpers'

describe('cases', () => {
  test('lists every case with a stable id', () => {
    expect(listCases(loadCatalog(FIXTURE)).map((c) => c.id)).toEqual([
      'frontend/mini-spa/alone',
      'frontend/mini-spa/brand',
      'frontend/mini-spa/default',
      'frontend/mini-ui/alone',
      'frontend/mini-ui/auth-off',
      'frontend/mini-ui/brand',
      'frontend/mini-ui/default',
      'frontend/mini-ui/fake',
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
  describe('brand', () => {
    const withCase = (yaml: string) => {
      const root = copyFixture('catalog')
      const file = path.join(root, 'frontend/mini-ui/tests/cases.yaml')
      writeFileSync(file, readFileSync(file, 'utf8') + yaml)
      return root
    }
    const EXPECTED = { primary: '#ea580c', radius: 'sm', theme: 'dark', density: 'compact' }

    test('reaches the plan and the provenance as answers.brand would', () => {
      const catalog = loadCatalog(FIXTURE)
      const brandCase = listCases(catalog).find((c) => c.id === 'frontend/mini-ui/brand')!
      const request = requestFor(brandCase, tempDir())
      expect(request.answers?.brand).toEqual(EXPECTED)
      expect(request.brand).toBeUndefined()
      const plan = resolveRequest(catalog, { ...request, skipPostGenerate: true })
      expect(plan.brand?.inputs).toMatchObject({ ...EXPECTED, neutral: '#64748b' })
      generate(catalog, plan)
      const provenance = parse(
        readFileSync(path.join(request.out, '.fullstack/catalog.yaml'), 'utf8'),
      )
      expect(provenance.answers.brand).toMatchObject({ primary: '#ea580c', density: 'compact' })
    })
    test('a stackless frontend case sends the brand the same way, as answers.brand', () => {
      const catalog = loadCatalog(
        withCase('  - name: alone-brand\n    brand:\n      primary: "#ea580c"\n      radius: sm\n'),
      )
      const alone = listCases(catalog).find((c) => c.id === 'frontend/mini-ui/alone-brand')!
      const request = requestFor(alone, tempDir())
      expect(request.template).toBe('frontend/mini-ui')
      expect(request.answers?.brand).toEqual({ primary: '#ea580c', radius: 'sm' })
      expect(request.brand).toBeUndefined()
      const plan = resolveRequest(catalog, { ...request, skipPostGenerate: true })
      expect(plan.brand?.inputs).toMatchObject({ primary: '#ea580c', radius: 'sm' })
    })
    test('a case without a brand sends none', () => {
      const request = requestFor(
        listCases(loadCatalog(FIXTURE)).find((c) => c.id === 'frontend/mini-ui/default')!,
        'out',
      )
      expect(request.answers?.brand).toBeUndefined()
    })
    test('an unknown brand key is refused, naming it', () => {
      const bad = withCase('  - name: bad\n    stack: mini\n    brand:\n      colour: red\n')
      expect(() => loadCatalog(bad)).toThrow(/colour/)
    })
  })
})
