import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadCatalog } from '../lib/catalog'
import { CommandError } from '../lib/commands'
import { checkLockfiles, type QuietRunner } from '../lib/lockfiles'
import { copyFixture, FIXTURE } from './helpers'

// The pyproject checks run the real uv; fail with a reason, not a spawn error, when it is absent.
function requireUv(): void {
  if (Bun.which('uv') === null) {
    throw new Error('uv is not on PATH; install uv to run the uv lockfile tests')
  }
}

function checkOnly(root: string, template: string, runUv?: QuietRunner): string[] {
  const catalog = loadCatalog(root)
  for (const key of [...catalog.templates.keys()]) {
    if (key !== template) catalog.templates.delete(key)
  }
  return checkLockfiles(catalog, runUv)
}

describe('checkLockfiles', () => {
  test('passes an npm template whose bun.lock is in sync', () => {
    expect(checkOnly(FIXTURE, 'frontend/mini-ui')).toEqual([])
  })

  test('reports a missing bun.lock as before', () => {
    const root = copyFixture('catalog')
    rmSync(path.join(root, 'frontend/mini-ui/base/bun.lock'))
    expect(checkOnly(root, 'frontend/mini-ui')).toEqual([
      'frontend/mini-ui: bun.lock is missing next to base/package.json',
    ])
  })

  test('passes a pyproject template whose uv.lock is in sync, leaving no .venv in base/', () => {
    requireUv()
    expect(checkOnly(FIXTURE, 'server/mini-py')).toEqual([])
    const base = path.join(FIXTURE, 'server/mini-py/base')
    expect(existsSync(path.join(base, '.venv'))).toBe(false)
  })

  test('fails an edited dependency line, naming the template and the fix', () => {
    requireUv()
    const root = copyFixture('catalog')
    const file = path.join(root, 'server/mini-py/base/pyproject.toml')
    // Dropping the only dependency makes the lock stale without any package to resolve, so the
    // check needs no network (a changed range would re-resolve against the index).
    const dependencyLine = /^ {2}"idna>=3\.0",.*\n/m
    writeFileSync(file, readFileSync(file, 'utf8').replace(dependencyLine, ''))
    const [problem, ...rest] = checkOnly(root, 'server/mini-py')
    expect(rest).toEqual([])
    expect(problem).toContain('server/mini-py')
    expect(problem).toContain('uv.lock is out of date')
    expect(problem).toContain('run uv lock in base/')
  })

  test('reports a missing uv.lock', () => {
    const root = copyFixture('catalog')
    rmSync(path.join(root, 'server/mini-py/base/uv.lock'))
    expect(checkOnly(root, 'server/mini-py')).toEqual([
      'server/mini-py: uv.lock is missing next to base/pyproject.toml',
    ])
  })

  test('quotes uv for a failure that is not drift instead of calling the lock stale', () => {
    const failing: QuietRunner = (line, cwd) => {
      const stderr = '\nerror: failed to fetch idna\n  caused by: dns\n'
      throw new CommandError(line, cwd, 2, undefined, stderr)
    }
    expect(checkOnly(FIXTURE, 'server/mini-py', failing)).toEqual([
      'server/mini-py: uv lock --check failed: error: failed to fetch idna',
    ])
  })

  test('says uv is not available when it cannot be started', () => {
    const missing: QuietRunner = (line, cwd) => {
      throw new CommandError(line, cwd, null, 'cannot run uv: ENOENT')
    }
    const [problem, ...rest] = checkOnly(FIXTURE, 'server/mini-py', missing)
    expect(rest).toEqual([])
    expect(problem).toContain('server/mini-py: cannot check uv.lock, uv is not available on PATH')
    expect(problem).not.toContain('out of date')
  })
})
