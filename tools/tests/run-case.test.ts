import { describe, expect, test } from 'bun:test'
import { loadCatalog } from '../lib/catalog'
import { listCases } from '../lib/cases'
import { runCase, type Options } from '../lib/run-case'
import { FIXTURE, tempDir } from './helpers'

const catalog = loadCatalog(FIXTURE)
const find = (id: string) => {
  const found = listCases(catalog).find((c) => c.id === id)
  if (!found) throw new Error(`no case ${id}`)
  return found
}
const OFF: Options = { e2e: false, installBrowsers: false, keep: false, withServices: false }
const ON: Options = { ...OFF, withServices: true }

function recorder(failOn?: string) {
  const calls: { line: string; cwd: string }[] = []
  const runner = (line: string, cwd: string) => {
    calls.push({ line, cwd })
    if (failOn !== undefined && line === failOn) throw new Error(`boom ${line}`)
  }
  return { calls, runner }
}
const lines = () => {
  const out: string[] = []
  return { out, log: (message: string) => out.push(message) }
}

describe('runCase with services', () => {
  test('starts the provider, migrates, checks, tests the database, then tears down', () => {
    const { calls, runner } = recorder()
    runCase(catalog, find('server/mini/fake'), tempDir(), ON, runner, lines().log)
    const up = calls[0]?.line ?? ''
    const project = up.match(/^docker compose -p (\S+) up -d --wait database$/)?.[1]
    expect(project).toMatch(/^[a-z0-9][a-z0-9_-]*$/)
    expect(calls.map((c) => c.line.replace(project as string, '<p>'))).toEqual([
      'docker compose -p <p> up -d --wait database',
      'bun run db:migrate',
      'bun ./ok.ts',
      'bun run test:db',
      'docker compose -p <p> down -v --remove-orphans',
    ])
    expect(calls[0]?.cwd).toBe(calls[4]?.cwd as string)
  })
  test('project names differ between runs', () => {
    const a = recorder()
    const b = recorder()
    runCase(catalog, find('server/mini/fake'), tempDir(), ON, a.runner, lines().log)
    runCase(catalog, find('server/mini/fake'), tempDir(), ON, b.runner, lines().log)
    expect(a.calls[0]?.line).not.toBe(b.calls[0]?.line)
  })
  test('tears down when a step fails and throws the original error', () => {
    const { calls, runner } = recorder('bun ./ok.ts')
    expect(() =>
      runCase(catalog, find('server/mini/fake'), tempDir(), ON, runner, lines().log),
    ).toThrow('boom bun ./ok.ts')
    expect(calls.at(-1)?.line).toMatch(/ down -v --remove-orphans$/)
    expect(calls.some((c) => c.line === 'bun run test:db')).toBe(false)
  })
  test('a teardown failure fails the case without hiding the original error', () => {
    const calls: string[] = []
    const runner = (line: string) => {
      calls.push(line)
      if (line === 'bun ./ok.ts') throw new Error('primary')
      if (line.includes(' down ')) throw new Error('teardown')
    }
    const { out, log } = lines()
    expect(() => runCase(catalog, find('server/mini/fake'), tempDir(), ON, runner, log)).toThrow(
      'primary',
    )
    expect(out.join('\n')).toContain('teardown')
  })
  test('a teardown failure alone fails the case', () => {
    const runner = (line: string) => {
      if (line.includes(' down ')) throw new Error('teardown')
    }
    expect(() =>
      runCase(catalog, find('server/mini/fake'), tempDir(), ON, runner, lines().log),
    ).toThrow('teardown')
  })
})

describe('runCase without --with-services', () => {
  test('runs check only and prints the two SKIP lines', () => {
    const { calls, runner } = recorder()
    const { out, log } = lines()
    runCase(catalog, find('server/mini/fake'), tempDir(), OFF, runner, log)
    expect(calls.map((c) => c.line)).toEqual(['bun ./ok.ts'])
    expect(out).toEqual([
      'SKIP migrate backend: needs --with-services',
      'SKIP testDb backend: needs --with-services',
    ])
  })
})

describe('runCase without a capability', () => {
  test('runs exactly check, with or without --with-services', () => {
    for (const options of [OFF, ON]) {
      const { calls, runner } = recorder()
      const { out, log } = lines()
      runCase(catalog, find('server/mini/default'), tempDir(), options, runner, log)
      expect(calls.map((c) => c.line)).toEqual(['bun ./ok.ts'])
      expect(out).toEqual([])
    }
  })
})
