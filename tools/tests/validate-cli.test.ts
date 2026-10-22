import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { copyFixture } from './helpers'

const cli = path.join(import.meta.dir, '..', 'validate.ts')
const run = (root: string, ...args: string[]) =>
  spawnSync('bun', [cli, '--catalog', root, ...args], { encoding: 'utf8' })

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
})
