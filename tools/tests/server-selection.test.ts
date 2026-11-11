import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadCatalog } from '../lib/catalog'
import { generate } from '../lib/generate'
import { resolveRequest } from '../lib/plan'
import { validateAgainst } from '../lib/schema'
import { copyFixture, tempDir } from './helpers'

const spa = 'frontend/mini-spa/template.yaml'
const pkgFile = 'frontend/mini-spa/base/package.json'

const OBJECT_FORM = `onlyWhen:
  server:
    onlyPaths: [src/client.ts]
    dependencies:
      remove: ['@hey-api/openapi-ts']
    scripts:
      remove: ['api:types']
`
const PACKAGE = JSON.stringify(
  {
    name: '__PROJECT_NAME__-frontend',
    scripts: { 'api:types': 'openapi-ts', build: 'vite build' },
    dependencies: { jose: '^6' },
    devDependencies: { '@hey-api/openapi-ts': '^0.9' },
  },
  null,
  2,
)

// A copy of the fixture catalog whose mini-spa carries the bare `server` key.
function catalogWith(
  edits: Record<string, (text: string) => string> = {},
  onlyWhen = OBJECT_FORM,
): () => ReturnType<typeof loadCatalog> {
  const root = copyFixture('catalog')
  const change = (rel: string, fn: (text: string) => string) => {
    const file = path.join(root, rel)
    writeFileSync(file, fn(readFileSync(file, 'utf8')))
  }
  change(spa, (t) => t.replace('gitignore:', `${onlyWhen}gitignore:`))
  writeFileSync(path.join(root, pkgFile), PACKAGE)
  for (const [rel, fn] of Object.entries(edits)) change(rel, fn)
  return () => loadCatalog(root)
}

const request = (out: string, extra = {}) => ({
  out,
  name: 'Demo',
  flags: [],
  capabilities: [],
  skipPostGenerate: true,
  stack: 'mini-spa',
  ...extra,
})
const lone = { stack: undefined, template: 'frontend/mini-spa' }
const read = (out: string, ...parts: string[]) => readFileSync(path.join(out, ...parts), 'utf8')

const manifest = {
  schemaVersion: 1,
  id: 'x',
  kind: 'frontend',
  name: 'X',
  version: '1.0.0',
  summary: 's',
  runtime: { language: 'typescript', platform: 'bun' },
  tools: [{ name: 'bun' }],
  placeholders: [],
  commands: { check: 'bun run check' },
  agents: 'AGENTS.md',
}

describe('onlyWhen schema: the bare server key and the object form', () => {
  const errors = (onlyWhen: unknown) => validateAgainst('template', { ...manifest, onlyWhen })

  test('accepts server and server:<name>, as a list or an object', () => {
    expect(errors({ server: ['src/a.ts'] })).toEqual([])
    expect(errors({ 'server:auth': ['src/a.ts'], server: ['src/b.ts'] })).toEqual([])
    expect(errors({ server: { onlyPaths: ['src/a.ts'] } })).toEqual([])
    expect(errors({ server: { dependencies: { remove: ['a'] } } })).toEqual([])
    expect(errors({ server: { scripts: { remove: ['api:types'] } } })).toEqual([])
    const all = { onlyPaths: ['a'], dependencies: { remove: ['b'] }, scripts: { remove: ['c'] } }
    expect(errors({ 'server:auth': all })).toEqual([])
  })

  test('refuses an empty object, an unknown key and a malformed value', () => {
    expect(errors({ server: {} })).not.toEqual([])
    expect(errors({ server: { add: ['a'] } })).not.toEqual([])
    expect(errors({ server: { dependencies: { add: { x: '1' } } } })).not.toEqual([])
    expect(errors({ server: { dependencies: {} } })).not.toEqual([])
    expect(errors({ server: { scripts: { remove: [1] } } })).not.toEqual([])
    expect(errors({ server: { onlyPaths: ['../a'] } })).not.toEqual([])
    expect(errors({ server: 'src/a.ts' })).not.toEqual([])
  })

  test('refuses a key that is neither server nor server:<name>', () => {
    expect(errors({ servers: ['a'] })).not.toEqual([])
    expect(errors({ 'server:': ['a'] })).not.toEqual([])
    expect(errors({ auth: ['a'] })).not.toEqual([])
  })
})

describe('onlyWhen loader checks', () => {
  test('loads the object form on the bare server key', () => {
    expect(catalogWith()).not.toThrow()
  })

  test('loads the path list form on the bare server key', () => {
    expect(catalogWith({}, 'onlyWhen:\n  server: [src/client.ts]\n')).not.toThrow()
  })

  test('refuses a path that is not in base, naming the template and the key', () => {
    const load = catalogWith({ [spa]: (t) => t.replace('[src/client.ts]', '[src/nope.ts]') })
    expect(load).toThrow(/frontend\/mini-spa.*onlyWhen "server" path "src\/nope\.ts"/s)
  })

  test('refuses a dependency that is not in the base manifest', () => {
    const load = catalogWith({ [spa]: (t) => t.replace("'@hey-api/openapi-ts'", 'ghost') })
    expect(load).toThrow(/frontend\/mini-spa.*onlyWhen "server" dependency "ghost"/s)
  })

  test('refuses a script that is not in the base manifest', () => {
    const load = catalogWith({ [spa]: (t) => t.replace("'api:types'", 'nothing') })
    expect(load).toThrow(/frontend\/mini-spa.*onlyWhen "server" script "nothing"/s)
  })

  test('refuses dependencies or scripts with the pyproject adapter', () => {
    const load = catalogWith({ [spa]: (t) => t.replace('adapter: npm', 'adapter: pyproject') })
    expect(load).toThrow(/frontend\/mini-spa.*onlyWhen "server".*pyproject/s)
  })

  test('refuses a dependency a flag of the same template already removes', () => {
    const flag = `flags:
  extra:
    summary: s
    default: true
    dependencies:
      remove: ['@hey-api/openapi-ts']
`
    const load = catalogWith({ [spa]: (t) => t.replace('gitignore:', `${flag}gitignore:`) })
    expect(load).toThrow(/frontend\/mini-spa.*onlyWhen "server".*also removed by flag "extra"/s)
  })
})

describe('generation without a server', () => {
  test('removes the paths, dependencies and scripts, with no contract command or Compose file', () => {
    const catalog = catalogWith()()
    const out = tempDir()
    const plan = resolveRequest(catalog, request(out, lone))
    expect(plan.packages[0]!.commands.contract).toBeUndefined()
    generate(catalog, plan)
    expect(existsSync(path.join(out, 'frontend', 'src', 'client.ts'))).toBe(false)
    const pkg = JSON.parse(read(out, 'frontend', 'package.json'))
    expect(pkg.scripts).toEqual({ build: 'vite build' })
    expect(pkg.dependencies).toEqual({ jose: '^6' })
    expect(pkg.devDependencies).toEqual({})
    expect(existsSync(path.join(out, 'docker-compose.yml'))).toBe(false)
    expect(read(out, '.fullstack', 'catalog.yaml')).not.toContain('contract')
  })

  test('a leftover SERVER_* placeholder fails and names the file, declared or not', () => {
    const catalog = catalogWith({
      'frontend/mini-spa/base/ok.ts': () => 'export const api = "http://__SERVER_DIR__"\n',
    })()
    expect(() => generate(catalog, resolveRequest(catalog, request(tempDir(), lone)))).toThrow(
      /ok\.ts.*unreplaced placeholder.*SERVER_DIR/s,
    )
    const out = tempDir()
    generate(catalog, resolveRequest(catalog, request(out)))
    expect(read(out, 'frontend', 'ok.ts')).toContain('http://backend')
  })

  test('a missing script is an error, like a missing dependency', () => {
    const catalog = catalogWith()()
    writeFileSync(
      path.join(catalog.templates.get('frontend/mini-spa')!.dir, 'base', 'package.json'),
      PACKAGE.replace('api:types', 'api:other'),
    )
    expect(() => generate(catalog, resolveRequest(catalog, request(tempDir(), lone)))).toThrow(
      /script api:types is missing/,
    )
  })
})

describe('generation with a server', () => {
  test('removes nothing and writes the Compose file and the contract command', () => {
    const catalog = catalogWith()()
    const out = tempDir()
    const plan = resolveRequest(catalog, request(out))
    const frontend = plan.packages.find((pkg) => pkg.dir === 'frontend')!
    expect(frontend.commands.contract).toBeDefined()
    generate(catalog, plan)
    expect(existsSync(path.join(out, 'frontend', 'src', 'client.ts'))).toBe(true)
    const pkg = JSON.parse(read(out, 'frontend', 'package.json'))
    expect(Object.keys(pkg.scripts)).toEqual(['api:types', 'build'])
    expect(pkg.devDependencies).toEqual({ '@hey-api/openapi-ts': '^0.9' })
    expect(existsSync(path.join(out, 'docker-compose.yml'))).toBe(true)
    expect(read(out, '.fullstack', 'catalog.yaml')).toContain('contract')
  })
})
