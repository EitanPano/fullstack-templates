import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { FIXTURE, tempDir } from './helpers'

const cli = path.join(import.meta.dir, '..', 'generate.ts')
const run = (args: string[], cwd = process.cwd()) =>
  spawnSync('bun', [cli, ...args], { cwd, encoding: 'utf8' })

describe('generate CLI', () => {
  test('generates a stack from a fixture catalog and prints next steps', () => {
    const out = tempDir()
    const result = run([
      '--stack',
      'mini',
      '--out',
      out,
      '--name',
      'Demo',
      '--catalog',
      FIXTURE,
      '--skip-post-generate',
    ])
    expect(result.status).toBe(0)
    expect(existsSync(path.join(out, 'backend', 'package.json'))).toBe(true)
    expect(result.stdout).toContain('cd backend && bun ./ok.ts')
  })

  test('resolves a relative --out against the working directory', () => {
    const cwd = tempDir()
    const result = run(
      [
        '--template',
        'server/mini',
        '--out',
        'proj',
        '--name',
        'demo',
        '--catalog',
        FIXTURE,
        '--skip-post-generate',
      ],
      cwd,
    )
    expect(result.status).toBe(0)
    expect(existsSync(path.join(cwd, 'proj', 'backend'))).toBe(true)
  })

  test('exits 2 on a usage error and 1 on a generation error', () => {
    expect(run(['--bogus']).status).toBe(2)
    const out = tempDir()
    expect(run(['--stack', 'nope', '--out', out, '--name', 'x', '--catalog', FIXTURE]).status).toBe(
      1,
    )
  })

  test('prints ==> step lines even with --skip-post-generate', () => {
    const out = tempDir()
    const result = run([
      '--stack',
      'mini',
      '--out',
      out,
      '--name',
      'Demo',
      '--catalog',
      FIXTURE,
      '--skip-post-generate',
    ])
    expect(result.stdout).toContain('==> Preparing backend')
  })

  test.each([
    ['a missing file', undefined],
    ['invalid JSON', '{ not json'],
    ['a non-object', '[]'],
  ])('exits 2 when --answers is %s', (_label, body) => {
    const dir = tempDir()
    const file = path.join(dir, 'answers.json')
    if (body !== undefined) writeFileSync(file, body)
    const result = run([
      '--stack',
      'mini',
      '--out',
      path.join(dir, 'o'),
      '--name',
      'x',
      '--catalog',
      FIXTURE,
      '--answers',
      file,
    ])
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('generate:')
  })
})
