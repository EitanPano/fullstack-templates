import { describe, expect, test } from 'bun:test'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadCatalog } from '../lib/catalog'
import { PlanError, resolveRequest } from '../lib/plan'
import { copyFixture, FIXTURE } from './helpers'

const catalog = loadCatalog(FIXTURE)
const base = {
  out: 'C:/tmp/x',
  name: 'Demo App',
  flags: [],
  capabilities: [],
  skipPostGenerate: true,
}

describe('resolveRequest', () => {
  test('resolves a stack with defaults, server wiring and contract order', () => {
    const plan = resolveRequest(catalog, { ...base, stack: 'mini' })
    expect(plan.projectName).toBe('demo-app')
    expect(plan.packages.map((p) => p.dir)).toEqual(['backend', 'frontend'])
    expect(plan.packages[0]?.flags).toEqual({ auth: true })
    expect(plan.packages[0]?.selections).toEqual({ auth: true })
    expect(plan.packages[1]?.serverDir).toBe('backend')
    expect(plan.packages[1]?.serverPort).toBe(4000)
    expect(plan.packages[1]?.contractSkipped).toBe(false)
  })
  test('routes a flag shorthand to the one package that declares it', () => {
    const plan = resolveRequest(catalog, { ...base, stack: 'mini', flags: ['auth=false'] })
    expect(plan.packages[0]?.flags).toEqual({ auth: false })
    expect(plan.packages[0]?.selections).toEqual({ auth: false })
  })
  test('rejects an ambiguous shorthand naming both packages', () => {
    const copy = copyFixture('catalog')
    const file = path.join(copy, 'frontend', 'mini-ui', 'template.yaml')
    const yaml = readFileSync(file, 'utf8').replace(
      'gitignore:',
      'flags:\n  auth:\n    summary: Auth\n    default: true\ngitignore:',
    )
    writeFileSync(file, yaml)
    const ambiguous = loadCatalog(copy)
    let message = ''
    try {
      resolveRequest(ambiguous, { ...base, stack: 'mini', flags: ['auth=false'] })
    } catch (error) {
      expect(error).toBeInstanceOf(PlanError)
      message = (error as Error).message
    }
    expect(message).toContain('backend')
    expect(message).toContain('frontend')
  })
  test('takes package-qualified answers', () => {
    const plan = resolveRequest(catalog, {
      ...base,
      stack: 'mini',
      answers: { projectName: 'other', packages: { backend: { flags: { auth: false } } } },
    })
    expect(plan.projectName).toBe('other')
    expect(plan.packages[0]?.flags.auth).toBe(false)
  })
  test('rejects an unknown flag and an answers key that is not a package dir', () => {
    expect(() =>
      resolveRequest(catalog, { ...base, stack: 'mini', flags: ['oauth=true'] }),
    ).toThrow(PlanError)
    expect(() =>
      resolveRequest(catalog, { ...base, stack: 'mini', answers: { packages: { api: {} } } }),
    ).toThrow('api')
  })
  test('rejects any capability selection in this milestone', () => {
    expect(() =>
      resolveRequest(catalog, { ...base, stack: 'mini', capabilities: ['database=postgres'] }),
    ).toThrow('no provider overlays')
  })
  test('generates a lone server into backend/ and a lone frontend with the contract skipped', () => {
    const server = resolveRequest(catalog, { ...base, template: 'server/mini' })
    expect(server.packages.map((p) => p.dir)).toEqual(['backend'])
    const front = resolveRequest(catalog, { ...base, template: 'frontend/mini-ui' })
    expect(front.packages[0]?.contractSkipped).toBe(true)
    expect(front.packages[0]?.serverDir).toBeNull()
  })
  test('requires exactly one of stack and template', () => {
    expect(() => resolveRequest(catalog, { ...base })).toThrow(PlanError)
    expect(() =>
      resolveRequest(catalog, { ...base, stack: 'mini', template: 'server/mini' }),
    ).toThrow(PlanError)
  })
})
