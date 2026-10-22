import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { copyFixture } from './helpers'

const cli = path.join(import.meta.dir, '..', 'validate.ts')
const run = (root: string, ...args: string[]) =>
  spawnSync('bun', [cli, '--catalog', root, ...args], { encoding: 'utf8' })

function fixtureWithReadme(): string {
  const root = copyFixture('catalog')
  writeFileSync(
    path.join(root, 'README.md'),
    '# fixture\n\n<!-- matrix:start -->\n<!-- matrix:end -->\n',
  )
  run(root, '--readme')
  return root
}

describe('validate CLI', () => {
  test('passes on the fixture after writing its README matrix', () => {
    const root = copyFixture('catalog')
    writeFileSync(
      path.join(root, 'README.md'),
      '# fixture\n\n<!-- matrix:start -->\n<!-- matrix:end -->\n',
    )
    expect(run(root, '--readme').status).toBe(0)
    expect(run(root).status).toBe(0)
  })
  test('fails on a stale matrix, an undeclared marker and a broken index, printing each problem', () => {
    const root = copyFixture('catalog')
    writeFileSync(
      path.join(root, 'README.md'),
      '# fixture\n\n<!-- matrix:start -->\nstale\n<!-- matrix:end -->\n',
    )
    writeFileSync(path.join(root, 'server/mini/base/src/extra.ts'), 'x // @oauth\n')
    const result = run(root)
    expect(result.status).toBe(1)
    expect(result.stdout + result.stderr).toContain('README.md')
    expect(result.stdout + result.stderr).toContain('extra.ts:1')
    expect(result.stdout).toContain('validate: README.md: matrix is stale, run validate --readme')
    const broken = run(copyFixture('broken-index'))
    expect(broken.status).toBe(1)
    expect(broken.stdout).toMatch(/^validate:.*server\/ghost/m)
  })

  test('--lockfiles passes on the fixture and fails when package.json drifts from its lock', () => {
    const root = fixtureWithReadme()
    expect(run(root, '--lockfiles').status).toBe(0)
    const manifest = path.join(root, 'server/mini/base/package.json')
    writeFileSync(
      manifest,
      readFileSync(manifest, 'utf8').replace('"jose": "^6"', '"jose": "^6", "left-pad": "^1"'),
    )
    expect(run(root).status).toBe(0)
    const result = run(root, '--lockfiles')
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('validate: server/mini: bun.lock is out of date')
  })
  test('--lockfiles reports a missing lock', () => {
    const root = fixtureWithReadme()
    rmSync(path.join(root, 'frontend/mini-ui/base/bun.lock'))
    const result = run(root, '--lockfiles')
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('validate: frontend/mini-ui: bun.lock is missing')
  })
})
