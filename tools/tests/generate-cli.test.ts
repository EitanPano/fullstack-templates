import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
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

  test('--capability runs end to end and prints the database steps', () => {
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
      '--capability',
      'database=fake',
      '--skip-post-generate',
    ])
    expect(result.status).toBe(0)
    expect(existsSync(path.join(out, 'db', 'init.sql'))).toBe(true)
    const next = result.stdout.slice(result.stdout.indexOf('Done. Next:')).split('\n')
    expect(next).toContain('  cd backend && bun ./ok.ts')
    expect(next).toContain('  docker compose up -d --wait database')
    expect(next).toContain('  cd backend && bun run db:migrate')
    expect(next).toContain('  cd backend && bun run test:db')
  })

  test('prints no database steps without a capability', () => {
    const out = tempDir()
    const result = run(['--stack', 'mini', '--out', out, '--name', 'D', '--catalog', FIXTURE])
    expect(result.status).toBe(0)
    expect(result.stdout).not.toContain('docker compose')
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

  test('an empty --name is not a usage error and falls back to app', () => {
    const out = tempDir()
    const result = run([
      '--stack',
      'mini',
      '--out',
      out,
      '--name',
      '',
      '--catalog',
      FIXTURE,
      '--skip-post-generate',
    ])
    expect(result.status).toBe(0)
    expect(readFileSync(path.join(out, 'docker-compose.yml'), 'utf8')).toContain('name: app')
  })
})
