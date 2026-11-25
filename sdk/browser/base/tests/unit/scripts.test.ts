// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

const scripts = fileURLToPath(new URL('../../scripts', import.meta.url))
const load = async <T>(name: string): Promise<T> =>
  (await import(/* @vite-ignore */ pathToFileURL(join(scripts, name)).href)) as T

const dirs: string[] = []
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdk-script-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('size script', () => {
  type Size = { checkSizes(root: string): { failures: string[]; rows: string[] } }
  const project = (
    budget: Record<string, number> | undefined,
    files: Record<string, number>,
    version = '1.0.0',
  ) => {
    const root = temp()
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'x', version, sdk: budget ? { sizeBudget: budget } : {} }),
    )
    for (const [file, size] of Object.entries(files)) {
      mkdirSync(join(root, file, '..'), { recursive: true })
      writeFileSync(join(root, file), 'a'.repeat(size))
    }
    return root
  }

  it('passes an output at or under its budget', async () => {
    const { checkSizes } = await load<Size>('lib/size.mjs')
    const result = checkSizes(
      project({ 'dist/a.js': 100, 'dist/b.js': 50 }, { 'dist/a.js': 100, 'dist/b.js': 10 }),
    )
    expect(result.failures).toEqual([])
    expect(result.rows).toHaveLength(2)
  })

  it('fails an output over its budget and names it', async () => {
    const { checkSizes } = await load<Size>('lib/size.mjs')
    const result = checkSizes(project({ 'dist/a.js': 100 }, { 'dist/a.js': 101 }))
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]).toContain('dist/a.js')
    expect(result.failures[0]).toContain('101')
  })

  it('fails a budgeted output that was not built, and a package with no budget', async () => {
    const { checkSizes } = await load<Size>('lib/size.mjs')
    expect(checkSizes(project({ 'dist/a.js': 100 }, {})).failures[0]).toContain('missing')
    expect(checkSizes(project(undefined, {})).failures[0]).toContain('sizeBudget')
  })
})

describe('size script: the major and the unlisted outputs', () => {
  type Size = { checkSizes(root: string): { failures: string[]; rows: string[] } }
  const build = (version: string, files: string[]) => {
    const root = temp()
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'x',
        version,
        sdk: { sizeBudget: { 'dist/cdn/v{major}/loader.js': 100 } },
      }),
    )
    for (const file of files) {
      mkdirSync(join(root, file, '..'), { recursive: true })
      writeFileSync(join(root, file), 'a')
    }
    return root
  }

  it('reads the major from the version, so a bump renames no key', async () => {
    const { checkSizes } = await load<Size>('lib/size.mjs')
    expect(checkSizes(build('1.4.0', ['dist/cdn/v1/loader.js'])).failures).toEqual([])
    expect(checkSizes(build('2.0.0', ['dist/cdn/v2/loader.js'])).failures).toEqual([])
    expect(checkSizes(build('2.0.0', ['dist/cdn/v1/loader.js'])).failures[0]).toContain(
      'dist/cdn/v2/loader.js: missing',
    )
  })

  it('fails a .js output of the served folder that has no budget', async () => {
    const { checkSizes } = await load<Size>('lib/size.mjs')
    const result = checkSizes(
      build('1.0.0', ['dist/cdn/v1/loader.js', 'dist/cdn/v1/chunk.js', 'dist/cdn/v1/frame.html']),
    )
    expect(result.failures).toEqual(['dist/cdn/v1/chunk.js: has no size budget'])
  })

  it('fails a .css output of the served folder that has no budget', async () => {
    const { checkSizes } = await load<Size>('lib/size.mjs')
    const result = checkSizes(build('1.0.0', ['dist/cdn/v1/loader.js', 'dist/cdn/v1/frame.css']))
    expect(result.failures).toEqual(['dist/cdn/v1/frame.css: has no size budget'])
  })

  it('passes a .css output that has a budget', async () => {
    const { checkSizes } = await load<Size>('lib/size.mjs')
    const root = build('1.0.0', ['dist/cdn/v1/loader.js', 'dist/cdn/v1/frame.css'])
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    pkg.sdk.sizeBudget['dist/cdn/v{major}/frame.css'] = 100
    writeFileSync(join(root, 'package.json'), JSON.stringify(pkg))
    expect(checkSizes(root).failures).toEqual([])
  })
})

describe('api report gate', () => {
  type Api = { runApi(options: { root: string; update: boolean }): boolean }
  const copy = () => {
    const root = temp()
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'tmp-sdk', version: '1.0.0', types: './dist/index.d.ts' }),
    )
    mkdirSync(join(root, 'dist'))
    writeFileSync(
      join(root, 'dist/index.d.ts'),
      'export declare function init(key: string): void;\n',
    )
    return root
  }

  it('fails a changed public export until api:update, then passes', async () => {
    const { runApi } = await load<Api>('lib/api.mjs')
    const root = copy()
    expect(runApi({ root, update: false })).toBe(false) // no report yet
    expect(runApi({ root, update: true })).toBe(true) // written
    expect(runApi({ root, update: false })).toBe(true) // matches

    writeFileSync(
      join(root, 'dist/index.d.ts'),
      'export declare function init(key: string): void;\nexport declare function track(): void;\n',
    )
    expect(runApi({ root, update: false })).toBe(false) // the surface changed
    expect(runApi({ root, update: true })).toBe(true)
    expect(runApi({ root, update: false })).toBe(true)
    expect(readFileSync(join(root, 'etc/sdk.api.txt'), 'utf8')).toContain('track')
  }, 60_000)

  it('fails a type the surface uses and forgot to export', async () => {
    const { runApi } = await load<Api>('lib/api.mjs')
    const root = copy()
    writeFileSync(
      join(root, 'dist/index.d.ts'),
      'interface Hidden { a: number }\nexport declare function init(options: Hidden): void;\nexport {};\n',
    )
    expect(runApi({ root, update: true })).toBe(false)
  }, 60_000)
})
