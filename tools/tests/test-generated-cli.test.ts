import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { FIXTURE, copyFixture } from './helpers'

const cli = path.join(import.meta.dir, '..', 'test-generated.ts')
const run = (root: string, ...args: string[]) =>
  spawnSync('bun', [cli, '--catalog', root, ...args], { encoding: 'utf8' })

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
    expect(run(FIXTURE, '--case', 'server/nope/default').status).toBe(2)
  })
  test('fails and keeps the directory when a check fails', () => {
    const root = copyFixture('catalog')
    const manifest = path.join(root, 'server/mini/template.yaml')
    writeFileSync(
      manifest,
      readFileSync(manifest, 'utf8').replace('check: bun ./ok.ts', 'check: bun ./fail.ts'),
    )
    const result = run(root, '--case', 'server/mini/default')
    expect(result.status).toBe(1)
    const line = result.stdout.match(/FAIL server\/mini\/default \((.+)\)/)
    expect(line).not.toBeNull()
    expect(existsSync((line as RegExpMatchArray)[1] as string)).toBe(true)
  })
})
