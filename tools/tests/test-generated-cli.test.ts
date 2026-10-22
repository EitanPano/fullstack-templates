import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { FIXTURE, copyFixture } from './helpers'

const cli = path.join(import.meta.dir, '..', 'test-generated.ts')
const run = (root: string, ...args: string[]) =>
  spawnSync('bun', [cli, '--catalog', root, ...args], { encoding: 'utf8' })

function editManifest(root: string, file: string, from: string, to: string): void {
  const manifest = path.join(root, file)
  writeFileSync(manifest, readFileSync(manifest, 'utf8').replace(from, to))
}

describe('test-generated CLI', () => {
  test('lists cases as JSON', () => {
    const result = run(FIXTURE, '--list')
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toContain('server/mini/default')
  })
  test('passes every fixture case', () => {
    const result = run(FIXTURE)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('PASS server/mini/auth-off')
    expect(result.stdout).toContain('PASS frontend/mini-ui/default')
  })
  test('rejects an unknown case id as a usage error', () => {
    const result = run(FIXTURE, '--case', 'server/nope/default')
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('test-generated: unknown case')
  })
  test('fails and keeps the directory when a check fails', () => {
    const root = copyFixture('catalog')
    editManifest(root, 'server/mini/template.yaml', 'check: bun ./ok.ts', 'check: bun ./fail.ts')
    const result = run(root, '--case', 'server/mini/default')
    expect(result.status).toBe(1)
    const line = result.stdout.match(/FAIL server\/mini\/default \((.+)\)/)
    expect(line).not.toBeNull()
    expect(existsSync((line as RegExpMatchArray)[1] as string)).toBe(true)
  })
  test('--e2e skips the e2e suite of a package generated without a server', () => {
    const root = copyFixture('catalog')
    editManifest(
      root,
      'frontend/mini-ui/template.yaml',
      'check: bun ./ok.ts',
      'check: bun ./ok.ts\n  testE2e: bun ./fail.ts',
    )
    writeFileSync(path.join(root, 'frontend/mini-ui/base/fail.ts'), 'process.exit(3)\n')
    const result = run(root, '--case', 'frontend/mini-ui/alone', '--e2e')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('SKIP e2e frontend: no server in the plan')
  })
  test('--keep leaves the directory of a passing case', () => {
    const result = run(FIXTURE, '--case', 'server/mini/default', '--keep')
    expect(result.status).toBe(0)
    const kept = result.stdout.match(/^KEPT (.+)$/m)
    expect(kept).not.toBeNull()
    expect(existsSync((kept as RegExpMatchArray)[1] as string)).toBe(true)
  })
  test('--e2e runs testE2e after check and fails the case; without --e2e it passes', () => {
    const root = copyFixture('catalog')
    editManifest(
      root,
      'frontend/mini-ui/template.yaml',
      'check: bun ./ok.ts',
      'check: bun ./ok.ts\n  testE2e: bun ./fail.ts',
    )
    writeFileSync(path.join(root, 'frontend/mini-ui/base/fail.ts'), 'process.exit(3)\n')
    expect(run(root, '--case', 'frontend/mini-ui/default').status).toBe(0)
    const result = run(root, '--case', 'frontend/mini-ui/default', '--e2e')
    expect(result.status).toBe(1)
    expect(result.stdout).toMatch(/FAIL frontend\/mini-ui\/default \(.+\)/)
  })
  test('runs every --case given and counts them in the summary', () => {
    const result = run(FIXTURE, '--case', 'server/mini/default', '--case', 'server/mini/auth-off')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('2 of 2 cases passed')
  })
  test('a case that cannot spawn its check is a FAIL and the run continues', () => {
    const root = copyFixture('catalog')
    editManifest(
      root,
      'frontend/mini-ui/template.yaml',
      'check: bun ./ok.ts',
      'check: definitely-missing-program x',
    )
    const result = run(root)
    expect(result.status).toBe(1)
    expect(result.stdout).toMatch(/FAIL frontend\/mini-ui\/default \(.+\)/)
    expect(result.stdout).toContain('PASS server/mini/default')
    expect(result.stdout).toContain('2 of 4 cases passed')
  })
})
