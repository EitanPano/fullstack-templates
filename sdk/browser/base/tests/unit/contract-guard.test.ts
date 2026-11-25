// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

// The `contract` step fails closed: a server without the SDK namespace is refused, and nothing
// outside /api/sdk/ ever stays in src/contract/. It runs in a temp project under .tmp/ of this
// package, so the real openapi-ts and prettier resolve from here.
const base = fileURLToPath(new URL('../..', import.meta.url))
type Guard = {
  runContract(options: {
    root: string
    generate?: (root: string) => void
  }): Promise<{ ok: boolean; message: string }>
}
const load = async () =>
  (await import(
    /* @vite-ignore */ pathToFileURL(join(base, 'scripts/lib/contract.mjs')).href
  )) as Guard

const operation = (id: string, schema: string) => ({
  get: {
    operationId: id,
    responses: {
      '200': {
        description: 'ok',
        content: { 'application/json': { schema: { $ref: `#/components/schemas/${schema}` } } },
      },
    },
  },
})
const SCHEMAS = {
  SdkConfig: {
    type: 'object',
    required: ['enabled'],
    properties: { enabled: { type: 'boolean' } },
  },
  OtherThing: { type: 'object', required: ['secret'], properties: { secret: { type: 'string' } } },
}
const SDK = { '/api/sdk/v1/config': operation('getSdkConfig', 'SdkConfig') }
const OTHER = { '/api/other/thing': operation('getOtherThing', 'OtherThing') }

const roots: string[] = []
const SENTINEL = '// the previous contract\nexport type Previous = string\n'

function project(paths: Record<string, unknown>) {
  mkdirSync(join(base, '.tmp'), { recursive: true })
  const root = mkdtempSync(join(base, '.tmp', 'guard-'))
  roots.push(root)
  writeFileSync(
    join(root, 'openapi.json'),
    JSON.stringify({
      openapi: '3.1.0',
      info: { title: 'T', version: '1' },
      paths,
      components: { schemas: SCHEMAS },
    }),
  )
  const config = readFileSync(join(base, 'openapi-ts.config.ts'), 'utf8').replace(
    /CONTRACT_INPUT = '[^']*'/,
    "CONTRACT_INPUT = './openapi.json'",
  )
  writeFileSync(join(root, 'openapi-ts.config.ts'), config)
  mkdirSync(join(root, 'src/contract'), { recursive: true })
  writeFileSync(join(root, 'src/contract/types.gen.ts'), SENTINEL)
  return root
}
const types = (root: string) => readFileSync(join(root, 'src/contract/types.gen.ts'), 'utf8')

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('contract guard', () => {
  it('refuses a document with no operation under /api/sdk/ and writes nothing', async () => {
    const { runContract } = await load()
    const root = project(OTHER)
    const result = await runContract({ root })
    expect(result.ok).toBe(false)
    expect(result.message).toBe(
      "the server's contract has no /api/sdk/ path: an SDK needs a server with the SDK namespace",
    )
    expect(types(root)).toBe(SENTINEL)
    expect(readdirSync(join(root, 'src/contract'))).toEqual(['types.gen.ts'])
  }, 60_000)

  it('keeps only the SDK types of a document that holds both kinds', async () => {
    const { runContract } = await load()
    const root = project({ ...SDK, ...OTHER })
    const result = await runContract({ root })
    expect(result.ok).toBe(true)
    expect(types(root)).toContain('SdkConfig')
    expect(types(root)).not.toMatch(/OtherThing|secret|\/api\/other/)
  }, 60_000)

  it('passes a document that holds only SDK paths', async () => {
    const { runContract } = await load()
    const root = project(SDK)
    expect((await runContract({ root })).ok).toBe(true)
    expect(types(root)).toContain('/api/sdk/v1/config')
  }, 60_000)

  it('restores the previous output when a generated URL names a path outside /api/sdk/', async () => {
    const { runContract } = await load()
    const root = project(SDK)
    const result = await runContract({
      root,
      generate(dir) {
        writeFileSync(
          join(dir, 'src/contract/types.gen.ts'),
          'export type LeakData = { url: "/api/user/me" }\n',
        )
        writeFileSync(join(dir, 'src/contract/extra.ts'), 'export {}\n')
      },
    })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('/api/user/me')
    expect(types(root)).toBe(SENTINEL)
    expect(readdirSync(join(root, 'src/contract'))).toEqual(['types.gen.ts'])
  }, 60_000)
})
