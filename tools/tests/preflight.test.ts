import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { loadCatalog } from '../lib/catalog'
import { GenerateError, STAGING_DIR, generate } from '../lib/generate'
import { resolveRequest } from '../lib/plan'
import { findToolProblem, parseVersion } from '../lib/preflight'
import { FIXTURE, tempDir } from './helpers'

const catalog = loadCatalog(FIXTURE)
const request = (out: string, extra = {}) => ({
  out,
  name: 'Demo',
  flags: [],
  capabilities: [],
  skipPostGenerate: false,
  template: 'server/mini-py',
  ...extra,
})

describe('parseVersion', () => {
  test('reads uv-style output', () => {
    expect(parseVersion('uv 0.12.23 (abc 2026-10-01)')).toEqual([0, 12, 23])
  })
  test('reads MAJOR.MINOR as patch 0 and takes the first version', () => {
    expect(parseVersion('1.4 and 9.9.9')).toEqual([1, 4, 0])
  })
  test('reads a bare major, as the node minimum is declared', () => {
    expect(parseVersion('24')).toEqual([24, 0, 0])
    expect(parseVersion('v24.11.0')).toEqual([24, 11, 0])
  })
  test('returns undefined without a version', () => {
    expect(parseVersion('no digits here')).toBeUndefined()
  })
})

describe('tools preflight', () => {
  test('a missing tool fails before staging, naming the tool, not found and the minimum', () => {
    const out = tempDir()
    let error: unknown
    try {
      generate(catalog, resolveRequest(catalog, request(out)), {
        toolVersion: () => undefined,
        keepStaging: true,
      })
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(GenerateError)
    const message = (error as Error).message
    expect(message).toContain('uv')
    expect(message).toContain('not found')
    expect(message).toContain('0.12.23')
    expect(existsSync(path.join(out, STAGING_DIR))).toBe(false)
    expect(existsSync(path.join(out, 'backend'))).toBe(false)
  })

  test('a too-old version names the found and the minimum versions', () => {
    expect(() =>
      generate(catalog, resolveRequest(catalog, request(tempDir())), {
        toolVersion: () => 'uv 0.12.2 (x)',
      }),
    ).toThrow('tool uv: found 0.12.2, minimum is 0.12.23')
  })

  test('compares numerically, not as text', () => {
    const plan = resolveRequest(catalog, request(tempDir()))
    expect(findToolProblem(plan, () => 'uv 0.9.30')).toContain('found 0.9.30')
    expect(findToolProblem(plan, () => 'uv 0.12.100')).toBeUndefined()
  })

  test('a new-enough version passes and the package is generated', () => {
    const out = tempDir()
    const asked: string[] = []
    generate(catalog, resolveRequest(catalog, request(out)), {
      toolVersion: (name) => {
        asked.push(name)
        return 'uv 0.12.23 (abc 2026-10-01)'
      },
    })
    expect(asked).toEqual(['uv'])
    expect(existsSync(path.join(out, 'backend', 'pyproject.toml'))).toBe(true)
  })

  test('runs once per distinct tool name across packages', () => {
    const plan = resolveRequest(catalog, request(tempDir(), { template: undefined, stack: 'mini' }))
    const asked: string[] = []
    findToolProblem(plan, (name) => {
      asked.push(name)
      return 'bun 1.9.0'
    })
    expect(asked).toEqual(['bun'])
  })

  test('is skipped with skipPostGenerate', () => {
    const out = tempDir()
    generate(catalog, resolveRequest(catalog, request(out, { skipPostGenerate: true })), {
      toolVersion: () => {
        throw new Error('must not be called')
      },
    })
    expect(existsSync(path.join(out, 'backend', 'pyproject.toml'))).toBe(true)
  })
})
