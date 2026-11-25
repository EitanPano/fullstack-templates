// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

// Each gate is a file that always runs when it is executed: no guard on how it was started, which
// is false when a path is spelled in another case (the gate would then exit 0 having done
// nothing). These run the files themselves and check the exit code both ways.
const scripts = fileURLToPath(new URL('../../scripts', import.meta.url))
const run = (file: string, cwd: string, ...args: string[]) =>
  spawnSync(process.execPath, [join(scripts, file), ...args], { cwd, encoding: 'utf8' })

const dirs: string[] = []
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdk-cli-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('size.mjs', () => {
  const project = (size: number) => {
    const root = temp()
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ version: '1.0.0', sdk: { sizeBudget: { 'dist/a.js': 10 } } }),
    )
    mkdirSync(join(root, 'dist'))
    writeFileSync(join(root, 'dist/a.js'), 'a'.repeat(size))
    return root
  }
  it('exits 0 within the budget and 1 over it', () => {
    expect(run('size.mjs', project(5)).status).toBe(0)
    const over = run('size.mjs', project(11))
    expect(over.status).toBe(1)
    expect(over.stderr).toContain('over its budget')
  })
})

describe('api.mjs', () => {
  it('exits 1 with no report, 0 after --update and 0 when the surface matches', () => {
    const root = temp()
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'tmp-sdk', version: '1.0.0', types: './dist/index.d.ts' }),
    )
    mkdirSync(join(root, 'dist'))
    writeFileSync(join(root, 'dist/index.d.ts'), 'export declare function init(): void;\n')
    expect(run('api.mjs', root).status).toBe(1)
    expect(run('api.mjs', root, '--update').status).toBe(0)
    expect(run('api.mjs', root).status).toBe(0)
  }, 120_000)
})

describe('contract.mjs', () => {
  const base = fileURLToPath(new URL('../..', import.meta.url))
  // Under .tmp/ of this package, so the real openapi-ts and prettier resolve from here.
  const project = (paths: Record<string, unknown>) => {
    mkdirSync(join(base, '.tmp'), { recursive: true })
    const root = mkdtempSync(join(base, '.tmp', 'cli-'))
    dirs.push(root)
    const get = {
      get: {
        operationId: 'getSdkConfig',
        responses: {
          '200': {
            description: 'ok',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SdkConfig' } } },
          },
        },
      },
    }
    writeFileSync(
      join(root, 'openapi.json'),
      JSON.stringify({
        openapi: '3.1.0',
        info: { title: 'T', version: '1' },
        paths: Object.fromEntries(Object.keys(paths).map((path) => [path, get])),
        components: {
          schemas: { SdkConfig: { type: 'object', properties: { enabled: { type: 'boolean' } } } },
        },
      }),
    )
    const config = readFileSync(join(base, 'openapi-ts.config.ts'), 'utf8').replace(
      /CONTRACT_INPUT = '[^']*'/,
      "CONTRACT_INPUT = './openapi.json'",
    )
    writeFileSync(join(root, 'openapi-ts.config.ts'), config)
    return root
  }

  it('exits 1 for a document with no SDK path, and 0 for one with it', () => {
    expect(run('contract.mjs', project({ '/api/other': 1 })).status).toBe(1)
    expect(run('contract.mjs', project({ '/api/sdk/v1/config': 1 })).status).toBe(0)
  }, 120_000)
})
