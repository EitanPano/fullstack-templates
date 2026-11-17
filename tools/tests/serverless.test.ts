// ADR 0014 K1 to K4: the `serverless` kind, a package directory of two segments, a frontend that
// ships no image. The fixtures are serverless/mini-fn, frontend/mini-site and stacks/mini-site-fn.
import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { CatalogError, loadCatalog, type Catalog } from '../lib/catalog'
import { listCases, requestFor } from '../lib/cases'
import { dryRunMarkers } from '../lib/dry-run'
import { GenerateError, generate, packagePlaceholders } from '../lib/generate'
import { resolveRequest } from '../lib/plan'
import { runCase, type Options } from '../lib/run-case'
import { validateAgainst } from '../lib/schema'
import { FIXTURE, copyFixture, tempDir } from './helpers'

const catalog = loadCatalog(FIXTURE)
const base = { name: 'Demo', flags: [], capabilities: [], skipPostGenerate: true }
const fn = (extra = {}) => ({ ...base, out: tempDir(), template: 'serverless/mini-fn', ...extra })
const alone = (extra = {}) => ({
  ...base,
  out: tempDir(),
  template: 'frontend/mini-site',
  ...extra,
})
const site = (extra = {}) => ({ ...base, out: tempDir(), stack: 'mini-site-fn', ...extra })
const FN = 'serverless/mini-fn'

function edit(root: string, file: string, change: (text: string) => string): void {
  const target = path.join(root, file)
  writeFileSync(target, change(readFileSync(target, 'utf8')))
}

function problems(root: string): string {
  try {
    loadCatalog(root)
  } catch (error) {
    if (error instanceof CatalogError) return error.message
    throw error
  }
  throw new Error('expected a CatalogError')
}

function broken(file: string, change: (text: string) => string): string {
  const root = copyFixture('catalog')
  edit(root, file, change)
  return problems(root)
}

const read = (out: string, file: string) => readFileSync(path.join(out, file), 'utf8')
const has = (out: string, file: string) => existsSync(path.join(out, file))
const FN_TEMPLATE = `${FN}/template.yaml`
const SITE_TEMPLATE = 'frontend/mini-site/template.yaml'
const pkgOf = (plan: ReturnType<typeof resolveRequest>, dir: string) => {
  const found = plan.packages.find((p) => p.dir === dir)
  if (!found) throw new Error(`no package ${dir}`)
  return found
}
// A fresh catalog whose stack manifest can be changed without touching the files.
function withStack(id: string, packages: Array<{ template: string; dir: string }>): Catalog {
  const loaded = loadCatalog(FIXTURE)
  const stack = loaded.stacks.get(id)
  if (!stack) throw new Error(`no stack ${id}`)
  stack.manifest.packages = packages
  return loaded
}

describe('the schemas (K1, K3, K4)', () => {
  const template = parse(readFileSync(path.join(FIXTURE, FN_TEMPLATE), 'utf8'))
  test('the kind, the path and a two-segment dir are accepted', () => {
    expect(validateAgainst('template', template)).toEqual([])
    expect(
      validateAgainst('index', {
        schemaVersion: 1,
        templates: [
          { id: 'x', kind: 'serverless', path: 'serverless/x', version: '1.0.0', summary: 's' },
        ],
        stacks: [],
      }),
    ).toEqual([])
    const stack = (dir: string) => ({
      schemaVersion: 1,
      id: 'x',
      summary: 's',
      packages: [{ template: 'serverless/x', dir }],
    })
    expect(validateAgainst('stack', stack('serverless/cloudflare'))).toEqual([])
    expect(validateAgainst('stack', stack('app'))).toEqual([])
    for (const bad of ['a/b/c', 'a/../b', '../a', 'a\\b', '/a', 'a/', './a', 'A/b', 'a//b']) {
      expect(validateAgainst('stack', stack(bad))).not.toEqual([])
    }
  })
  test('the fullstack kind and the lanes key are gone', () => {
    expect(validateAgainst('template', { ...template, kind: 'fullstack' })).not.toEqual([])
    expect(validateAgainst('template', { ...template, lanes: { backend: ['a'] } })).not.toEqual([])
  })
  test('docker is a boolean; frontend is a reserved flag name', () => {
    expect(validateAgainst('template', { ...template, docker: false })).toEqual([])
    expect(validateAgainst('template', { ...template, docker: 'no' })).not.toEqual([])
    const flags = { frontend: { summary: 's', default: true } }
    expect(validateAgainst('template', { ...template, flags })).not.toEqual([])
  })
  test('provenance keys a package by one or two segments, no more', () => {
    const record = (key: string) => ({
      schemaVersion: 1,
      catalog: { repository: 'r', version: 'v0.1.0', commit: null },
      generatedAt: '2026-10-22T10:00:00Z',
      stack: null,
      packages: {
        [key]: {
          template: 'serverless/x',
          version: '1.0.0',
          flags: {},
          capabilities: {},
          commands: { check: 'bun run check' },
        },
      },
      providers: {},
      answers: { projectName: 'demo' },
    })
    expect(validateAgainst('provenance', record('serverless/cloudflare'))).toEqual([])
    expect(validateAgainst('provenance', record('frontend'))).toEqual([])
    expect(validateAgainst('provenance', record('a/b/c'))).not.toEqual([])
    expect(validateAgainst('provenance', record('../a'))).not.toEqual([])
    expect(validateAgainst('provenance', record('a\\b'))).not.toEqual([])
  })
})

describe('the loader: serverless (K2, K4)', () => {
  test('loads the template, the docker: false frontend and their stack', () => {
    expect(catalog.templates.get(FN)?.manifest.kind).toBe('serverless')
    expect(catalog.templates.get('frontend/mini-site')?.manifest.docker).toBe(false)
    expect(catalog.stacks.get('mini-site-fn')?.manifest.packages).toEqual([
      { template: FN, dir: 'serverless/mini-fn' },
      { template: 'frontend/mini-site', dir: 'frontend' },
    ])
  })
  test('needs no compose.yaml, and refuses one', () => {
    const root = copyFixture('catalog')
    writeFileSync(path.join(root, FN, 'compose.yaml'), 'services: {}\n')
    expect(problems(root)).toContain(
      `${FN}: compose.yaml is not for a serverless template, which ships no Docker image; delete it`,
    )
  })
  test('requires the five server headings', () => {
    const message = broken(`${FN}/base/AGENTS.md`, (t) =>
      t.replace('## Adding the data layer\n', '').replace('## Deployment\n', ''),
    )
    expect(message).toContain(
      `${FN}: agents file base/AGENTS.md lacks the headings "Adding the data layer", "Deployment"`,
    )
  })
  test.each([
    ['static', 'static:\n  out: dist\n', 'static is only for frontend templates'],
    [
      'capabilities',
      'capabilities:\n  database:\n    providers: []\n',
      'capabilities is not for a serverless template',
    ],
    [
      'onlyWhen',
      'onlyWhen:\n  server: [src/auth.ts]\n',
      'onlyWhen is not for a serverless template',
    ],
    ['docker', 'docker: false\n', 'docker is only for frontend templates'],
  ])('refuses %s', (_name, block, message) => {
    expect(broken(FN_TEMPLATE, (t) => t.replace('agents:', `${block}agents:`))).toContain(
      `${FN}: ${message}`,
    )
  })
  test('refuses lanes as an unknown key', () => {
    const message = broken(FN_TEMPLATE, (t) =>
      t.replace('agents:', 'lanes:\n  backend: [a]\nagents:'),
    )
    expect(message).toContain(`${FN}/template.yaml`)
  })
  test('allows contract.produces and http, demands no brand case', () => {
    expect(catalog.templates.get(FN)?.manifest.contract).toEqual({ produces: 'openapi.json' })
    expect(catalog.templates.get(FN)?.manifest.http?.port).toBe(8788)
    expect(catalog.templates.get(FN)?.cases.cases.some((c) => c.brand !== undefined)).toBe(false)
  })
  test('refuses withApp, a brand and server settings in its cases', () => {
    const cases = `${FN}/tests/cases.yaml`
    expect(
      broken(cases, (t) =>
        t.replace('  - name: auth-off\n', '  - name: auth-off\n    withApp: true\n'),
      ),
    ).toContain(
      `${FN}: case "auth-off" sets withApp, but a serverless template has no app smoke: remove withApp`,
    )
    expect(
      broken(cases, (t) =>
        t.replace('  - name: auth-off\n', '  - name: auth-off\n    brand:\n      radius: sm\n'),
      ),
    ).toContain(`${FN}: case "auth-off" has a brand, which only a frontend case takes`)
  })
})

describe('the loader: a frontend with docker: false (K3)', () => {
  test('refuses a compose.yaml', () => {
    const root = copyFixture('catalog')
    writeFileSync(path.join(root, 'frontend/mini-site/compose.yaml'), 'services: {}\n')
    expect(problems(root)).toContain(
      'frontend/mini-site: compose.yaml is not for a template with docker: false, which ships no image; delete it',
    )
  })
  test('a frontend that omits docker still needs a compose.yaml', () => {
    const message = broken(SITE_TEMPLATE, (t) => t.replace('docker: false\n', ''))
    expect(message).toContain('frontend/mini-site: compose.yaml is missing')
  })
  test('refuses withApp in its cases', () => {
    const message = broken('frontend/mini-site/tests/cases.yaml', (t) =>
      t.replace('  - name: islands\n', '  - name: islands\n    withApp: true\n'),
    )
    expect(message).toContain(
      'frontend/mini-site: case "islands" sets withApp, but a template that ships no image has no app smoke: remove withApp',
    )
  })
  test('a stack beside a server package is refused, naming both', () => {
    const message = broken('stacks/mini-site-fn/stack.yaml', (t) =>
      t
        .replace('serverless/mini-fn', 'server/mini')
        .replace('dir: serverless/server/mini', 'dir: backend'),
    )
    expect(message).toContain(
      'stacks/mini-site-fn: frontend/mini-site ships no image (docker: false) and cannot join server/mini; both deploy modes need an image',
    )
  })
  test('a stack with two API packages is refused', () => {
    const message = broken(
      'stacks/mini-site-fn/stack.yaml',
      (t) => `${t}  - template: server/mini\n    dir: backend\n`,
    )
    expect(message).toContain(
      'stacks/mini-site-fn: a stack takes one server or serverless package, found serverless/mini-fn and backend',
    )
  })
  test('a case may set the server flags of a serverless stack, and an unknown one is refused', () => {
    expect(
      listCases(catalog).find((c) => c.id === 'frontend/mini-site/server-auth-off')?.serverFlags,
    ).toEqual({ auth: false })
    const message = broken('frontend/mini-site/tests/cases.yaml', (t) =>
      t.replace('auth: false\n  - name: brand', 'nope: false\n  - name: brand'),
    )
    expect(message).toContain(
      `frontend/mini-site: case "server-auth-off" sets server flag "nope", which ${FN} does not declare`,
    )
  })
  test('a frontend case in a serverless stack refuses withApp', () => {
    const message = broken('frontend/mini-site/tests/cases.yaml', (t) =>
      t.replace('  - name: brand\n', '  - name: brand\n    withApp: true\n'),
    )
    expect(message).toContain('case "brand" sets withApp')
  })
  test('contract.consumes <server> resolves to a serverless package of the default stack', () => {
    const message = broken(
      'stacks/mini-site-fn/stack.yaml',
      (t) =>
        t.slice(0, t.indexOf('  - template: serverless')) +
        t.slice(t.indexOf('  - template: frontend')),
    )
    expect(message).toContain(
      'frontend/mini-site: contract.consumes names kind "server" but defaultStack "mini-site-fn" has no such package',
    )
  })
})

describe('package directories (K1)', () => {
  test('a stack may not hold a dir inside another package dir', () => {
    const message = broken('stacks/mini-site-fn/stack.yaml', (t) =>
      t.replace('dir: frontend', 'dir: serverless'),
    )
    expect(message).toContain(
      'stacks/mini-site-fn: package dir "serverless" would contain package dir "serverless/mini-fn"',
    )
  })
  test('a package that ships a Compose service takes one segment', () => {
    const message = broken('stacks/mini/stack.yaml', (t) =>
      t.replace('dir: backend', 'dir: apps/backend'),
    )
    expect(message).toContain(
      'stacks/mini: server/mini has the dir "apps/backend", but a package that ships a Compose service takes one segment',
    )
  })
})

describe('the plan (K1)', () => {
  test('a serverless template defaults to serverless/<id>, and --dir may name two segments', () => {
    expect(resolveRequest(catalog, fn()).packages.map((p) => p.dir)).toEqual(['serverless/mini-fn'])
    expect(
      resolveRequest(catalog, fn({ dir: 'serverless/other' })).packages.map((p) => p.dir),
    ).toEqual(['serverless/other'])
  })
  test.each(['a/b/c', 'a/../b', '../a', 'a\\b', '/a', 'A/b'])('--dir %s is refused', (dir) => {
    expect(() => resolveRequest(catalog, fn({ dir }))).toThrow(`invalid package dir: ${dir}`)
  })
  test('a server template takes one segment only', () => {
    expect(() =>
      resolveRequest(catalog, { ...base, out: tempDir(), template: 'server/mini', dir: 'a/b' }),
    ).toThrow(/server\/mini.*"a\/b".*Compose service.*one segment/)
  })
  test('a dir that contains another package dir is refused, naming both', () => {
    const own = withStack('mini-site-fn', [
      { template: FN, dir: 'serverless/mini-fn' },
      { template: 'frontend/mini-site', dir: 'serverless' },
    ])
    expect(() => resolveRequest(own, site())).toThrow(
      /package dir "serverless" would contain package dir "serverless\/mini-fn"/,
    )
  })
  test('a plan takes one server or serverless package', () => {
    const own = withStack('mini-site-fn', [
      { template: FN, dir: 'serverless/mini-fn' },
      { template: 'server/mini', dir: 'backend' },
    ])
    expect(() => resolveRequest(own, site())).toThrow(
      'a stack takes one server or serverless package, found serverless/mini-fn and backend',
    )
  })
  test('a docker: false frontend beside a server package is refused, naming both', () => {
    const own = withStack('mini', [
      { template: 'server/mini', dir: 'backend' },
      { template: 'frontend/mini-site', dir: 'frontend' },
    ])
    expect(() => resolveRequest(own, { ...base, out: tempDir(), stack: 'mini' })).toThrow(
      'frontend/mini-site ships no image (docker: false) and cannot join server/mini; both deploy modes need an image',
    )
  })
  test.each(['single', 'split'])('--deploy %s is refused with a serverless API', (deploy) => {
    expect(() => resolveRequest(catalog, site({ deploy }))).toThrow(
      /serverless\/mini-fn has no deploy mode.*no Docker image/,
    )
    expect(() => resolveRequest(catalog, fn({ deploy }))).toThrow(/has no deploy mode/)
  })
  test('a deploy mode in the answers is refused as well', () => {
    expect(() => resolveRequest(catalog, site({ answers: { deploy: 'single' } }))).toThrow(
      /has no deploy mode/,
    )
  })
  test('--deploy is refused for a frontend that ships no image, alone', () => {
    expect(() =>
      resolveRequest(catalog, {
        ...base,
        out: tempDir(),
        template: 'frontend/mini-site',
        deploy: 'split',
      }),
    ).toThrow(/frontend\/mini-site ships no image \(docker: false\), so deploy split cannot apply/)
  })
  test('the plan has no deploy mode, and single is false', () => {
    const plan = resolveRequest(catalog, site())
    expect(plan.deploy).toBeNull()
    for (const pkg of plan.packages) expect(pkg.selections.single).toBe(false)
  })
  test('a frontend sees the serverless package as its server', () => {
    const plan = resolveRequest(catalog, site())
    const front = pkgOf(plan, 'frontend')
    expect(front.serverDir).toBe('serverless/mini-fn')
    expect(front.serverPort).toBe(8788)
    expect(front.selections).toMatchObject({ server: true, 'server:auth': true, single: false })
    const off = resolveRequest(
      catalog,
      site({ answers: { packages: { 'serverless/mini-fn': { flags: { auth: false } } } } }),
    )
    expect(pkgOf(off, 'frontend').selections['server:auth']).toBe(false)
    expect(pkgOf(off, 'frontend').selections.server).toBe(true)
  })
  test('a lone frontend has every server selection off', () => {
    const plan = resolveRequest(catalog, {
      ...base,
      out: tempDir(),
      template: 'frontend/mini-site',
    })
    expect(pkgOf(plan, 'frontend').selections).toMatchObject({
      server: false,
      'server:auth': false,
    })
  })
  test('the serverless package has the frontend selection', () => {
    expect(pkgOf(resolveRequest(catalog, site()), 'serverless/mini-fn').selections.frontend).toBe(
      true,
    )
    expect(pkgOf(resolveRequest(catalog, fn()), 'serverless/mini-fn').selections.frontend).toBe(
      false,
    )
    expect(pkgOf(resolveRequest(catalog, site()), 'frontend').selections.frontend).toBeUndefined()
  })
  test('the contract consumer runs after the serverless producer, and keeps its contract', () => {
    const plan = resolveRequest(catalog, site())
    expect(plan.packages.map((p) => p.dir)).toEqual(['serverless/mini-fn', 'frontend'])
    expect(pkgOf(plan, 'frontend').contractSkipped).toBe(false)
    expect(pkgOf(plan, 'frontend').commands.contract).toBeDefined()
  })
  test('answers and flag shorthands route by the two-segment dir', () => {
    const plan = resolveRequest(
      catalog,
      site({
        flags: ['islands=true'],
        answers: { packages: { [FN]: { flags: { auth: false } } } },
      }),
    )
    expect(pkgOf(plan, 'serverless/mini-fn').flags).toEqual({ auth: false })
    expect(pkgOf(plan, 'frontend').flags).toMatchObject({ islands: true })
  })
})

describe('the placeholders (K4)', () => {
  test('a frontend gets the SERVER_* values of the serverless package', () => {
    const plan = resolveRequest(catalog, site())
    expect(packagePlaceholders(plan, pkgOf(plan, 'frontend'))).toMatchObject({
      SERVER_DIR: 'serverless/mini-fn',
      SERVER_PORT: '8788',
      SERVER_DEV_COMMAND: 'bun ./ok.ts dev',
      SERVER_START_COMMAND: 'bun ./ok.ts start',
      SERVER_E2E_DB_COMMAND: 'bun ./ok.ts e2eDb',
      SERVER_E2E_DATABASE_URL: '',
    })
  })
  test('the serverless package gets FRONTEND_PATH and FRONTEND_OUT beside a frontend', () => {
    const plan = resolveRequest(catalog, site())
    const values = packagePlaceholders(plan, pkgOf(plan, 'serverless/mini-fn'))
    expect(values.FRONTEND_PATH).toBe('../../frontend')
    expect(values.FRONTEND_OUT).toBe('dist')
    expect(values.FRONTEND_DIR).toBe('frontend')
  })
  test('without a frontend neither exists', () => {
    const plan = resolveRequest(catalog, fn())
    const values = packagePlaceholders(plan, pkgOf(plan, 'serverless/mini-fn'))
    expect(Object.keys(values)).not.toContain('FRONTEND_PATH')
    expect(Object.keys(values)).not.toContain('FRONTEND_OUT')
  })
  test('a frontend package never gets FRONTEND_PATH', () => {
    const plan = resolveRequest(catalog, site())
    expect(Object.keys(packagePlaceholders(plan, pkgOf(plan, 'frontend')))).not.toContain(
      'FRONTEND_PATH',
    )
  })
})

describe('the generator (K1, K4)', () => {
  test('a stack generates both packages into an empty folder, with no Compose file', () => {
    const out = tempDir()
    generate(catalog, resolveRequest(catalog, site({ out })))
    expect(has(out, 'frontend/src/pages/index.astro')).toBe(true)
    expect(has(out, `${FN}/wrangler.jsonc`)).toBe(true)
    expect(has(out, 'docker-compose.yml')).toBe(false)
    expect(read(out, `${FN}/wrangler.jsonc`)).toContain('"directory": "../../frontend/dist"')
    expect(read(out, `${FN}/src/serve.ts`)).toBe("export const root = '../../frontend/dist'\n")
    const client = read(out, 'frontend/src/client.ts')
    expect(client).toContain("spec: '../serverless/mini-fn/openapi.json'")
    expect(client).toContain("start: 'bun ./ok.ts start'")
    expect(client).not.toContain('__')
  })
  test('provenance keys the packages by dir, records no deploy and validates', () => {
    const out = tempDir()
    generate(catalog, resolveRequest(catalog, site({ out })))
    const record = parse(read(out, '.fullstack/catalog.yaml'))
    expect(Object.keys(record.packages).sort()).toEqual(['frontend', 'serverless/mini-fn'])
    expect(record.packages['serverless/mini-fn'].template).toBe(FN)
    expect(record.packages['serverless/mini-fn'].lanes).toBeUndefined()
    expect(record.deploy).toBeUndefined()
    expect(validateAgainst('provenance', record)).toEqual([])
  })
  test('the serverless package alone has no frontend lines', () => {
    const out = tempDir()
    generate(catalog, resolveRequest(catalog, fn({ out })))
    expect(read(out, `${FN}/src/serve.ts`)).toBe("export const mode = 'api only'\n")
    const text = read(out, `${FN}/wrangler.jsonc`)
    expect(text).toContain('"name": "demo"')
    expect(text).toContain('// Cloudflare configuration of demo')
    expect(text).not.toContain('assets')
    expect(text).not.toContain('@')
  })
  test('a folder that already holds serverless/other keeps it', () => {
    const out = tempDir()
    mkdirSync(path.join(out, 'serverless/other'), { recursive: true })
    writeFileSync(path.join(out, 'serverless/other/keep.txt'), 'mine')
    generate(catalog, resolveRequest(catalog, site({ out })))
    expect(read(out, 'serverless/other/keep.txt')).toBe('mine')
    expect(has(out, `${FN}/package.json`)).toBe(true)
  })
  test('an existing package target is refused and nothing is written', () => {
    const out = tempDir()
    mkdirSync(path.join(out, FN), { recursive: true })
    expect(() => generate(catalog, resolveRequest(catalog, site({ out })))).toThrow(
      `${path.join(out, FN)} already exists; nothing was written`,
    )
    expect(has(out, 'frontend')).toBe(false)
  })
  test('a failed run leaves no serverless folder it created', () => {
    const root = copyFixture('catalog')
    edit(root, `${FN}/base/src/serve.ts`, (t) => `${t}export const x = '__FRONTEND_PATH__'\n`)
    const own = loadCatalog(root)
    const out = tempDir()
    expect(() => generate(own, resolveRequest(own, fn({ out })))).toThrow(GenerateError)
    expect(has(out, 'serverless')).toBe(false)
  })
  test('a kept file that uses FRONTEND_PATH or FRONTEND_OUT without a frontend fails, naming it', () => {
    const root = copyFixture('catalog')
    edit(root, `${FN}/base/src/auth.ts`, () => "export const a = '__FRONTEND_PATH__'\n")
    const own = loadCatalog(root)
    expect(() => generate(own, resolveRequest(own, fn()))).toThrow(
      `${FN}/src/auth.ts: unreplaced placeholder __FRONTEND_PATH__`,
    )
    const second = copyFixture('catalog')
    edit(second, `${FN}/base/src/auth.ts`, () => "export const a = '__FRONTEND_OUT__'\n")
    const again = loadCatalog(second)
    expect(() => generate(again, resolveRequest(again, fn()))).toThrow(
      `${FN}/src/auth.ts: unreplaced placeholder __FRONTEND_OUT__`,
    )
  })
  test('with a frontend the same file generates', () => {
    const root = copyFixture('catalog')
    edit(root, `${FN}/base/src/auth.ts`, () => "export const a = '__FRONTEND_PATH__'\n")
    const own = loadCatalog(root)
    const out = tempDir()
    generate(own, resolveRequest(own, site({ out })))
    expect(read(out, `${FN}/src/auth.ts`)).toBe("export const a = '../../frontend'\n")
  })
  test('a frontend alone writes no Compose file and no server lines', () => {
    const out = tempDir()
    generate(catalog, resolveRequest(catalog, { ...base, out, template: 'frontend/mini-site' }))
    expect(has(out, 'docker-compose.yml')).toBe(false)
    expect(has(out, 'frontend/src/client.ts')).toBe(false)
    expect(has(out, 'frontend/src/session.ts')).toBe(false)
  })
  test('the server onlyWhen paths follow the serverless flags', () => {
    const on = tempDir()
    generate(catalog, resolveRequest(catalog, site({ out: on })))
    expect(has(on, 'frontend/src/client.ts')).toBe(true)
    expect(has(on, 'frontend/src/session.ts')).toBe(true)
    const off = tempDir()
    generate(
      catalog,
      resolveRequest(
        catalog,
        site({ out: off, answers: { packages: { [FN]: { flags: { auth: false } } } } }),
      ),
    )
    expect(has(off, 'frontend/src/client.ts')).toBe(true)
    expect(has(off, 'frontend/src/session.ts')).toBe(false)
    expect(has(off, `${FN}/src/auth.ts`)).toBe(false)
  })
  test('the root .gitignore holds the cloudflare section with patterns that reach nested packages', () => {
    const out = tempDir()
    generate(catalog, resolveRequest(catalog, site({ out })))
    const text = read(out, '.gitignore')
    expect(text).toContain('# --- fullstack-templates: cloudflare ---\n.wrangler/')
    const patterns = text
      .split('\n')
      .filter((l) => l !== '' && !l.startsWith('#') && !l.startsWith('!'))
    expect(patterns.filter((l) => l.startsWith('/') || l.includes('frontend'))).toEqual([])
  })
  test('the same selection gives the same tree from a template and a stack for the frontend', () => {
    const a = tempDir()
    const b = tempDir()
    generate(catalog, resolveRequest(catalog, { ...site({ out: a }) }))
    generate(catalog, resolveRequest(catalog, site({ out: b })))
    expect(read(a, 'frontend/src/pages/index.astro')).toBe(
      read(b, 'frontend/src/pages/index.astro'),
    )
  })
})

describe('markers and the two-flag path rule (K4)', () => {
  const page = (out: string) => read(out, 'frontend/src/pages/index.astro')
  test('an .astro file takes // in its frontmatter and <!-- --> in its markup', () => {
    const on = tempDir()
    generate(catalog, resolveRequest(catalog, alone({ out: on, flags: ['islands=true'] })))
    expect(page(on)).toBe(
      [
        '---',
        "const title = 'Home'",
        'const signedIn = true',
        'const hasIslands = true',
        '---',
        '<h1>{title} Demo</h1>',
        '<p>Always</p>',
        '<p>Islands</p>',
        '',
      ].join('\n'),
    )
    const off = tempDir()
    generate(catalog, resolveRequest(catalog, alone({ out: off, flags: ['auth=false'] })))
    expect(page(off)).toBe(
      [
        '---',
        "const title = 'Home'",
        'const signedOut = true',
        '---',
        '<h1>{title} Demo</h1>',
        '<p>No account</p>',
        '',
      ].join('\n'),
    )
  })
  // [islands, auth, src/both.ts, src/islands/login-form.ts, src/islands/island.ts]
  test.each([
    [true, true, true, true, true],
    [true, false, false, false, true],
    [false, true, false, false, false],
    [false, false, false, false, false],
  ])('islands %p, auth %p', (islands, auth, both, form, island) => {
    const out = tempDir()
    const flags = [`islands=${String(islands)}`, `auth=${String(auth)}`]
    generate(catalog, resolveRequest(catalog, alone({ out, flags })))
    expect(has(out, 'frontend/src/both.ts')).toBe(both)
    expect(has(out, 'frontend/src/islands/login-form.ts')).toBe(form)
    expect(has(out, 'frontend/src/islands/island.ts')).toBe(island)
    expect(has(out, 'frontend/src/auth.ts')).toBe(auth)
  })
  test('a flag path overlapping an onlyWhen path is still refused', () => {
    const message = broken(SITE_TEMPLATE, (t) =>
      t.replace('server: [src/client.ts]', 'server: [src/client.ts, src/auth.ts]'),
    )
    expect(message).toContain('overlap')
  })
  test('the marker dry-run passes every combination, serverless included', () => {
    const serverNames = ['auth']
    for (const id of [FN, 'frontend/mini-site']) {
      const template = catalog.templates.get(id)
      expect(dryRunMarkers(template as NonNullable<typeof template>, serverNames)).toEqual([])
    }
  })
  test('a frontend marker in a frontend template is undeclared', () => {
    const root = copyFixture('catalog')
    edit(
      root,
      'frontend/mini-site/base/src/both.ts',
      (t) => `${t}export const f = 1 // @frontend\n`,
    )
    const own = loadCatalog(root)
    const template = own.templates.get('frontend/mini-site')
    expect(dryRunMarkers(template as NonNullable<typeof template>, ['auth']).join('\n')).toContain(
      'frontend',
    )
  })
})

describe('the case runner (K4)', () => {
  const ALL: Options = {
    e2e: true,
    installBrowsers: false,
    keep: false,
    withServices: true,
    withApp: true,
  }
  const OFF: Options = { ...ALL, e2e: false, withServices: false, withApp: false }
  const find = (id: string) => {
    const found = listCases(catalog).find((c) => c.id === id)
    if (!found) throw new Error(`no case ${id}`)
    return found
  }
  const record = async (id: string, options: Options) => {
    const calls: string[] = []
    const logs: string[] = []
    await runCase(
      catalog,
      find(id),
      tempDir(),
      options,
      (line) => void calls.push(line),
      (message) => void logs.push(message),
    )
    return { calls, logs }
  }

  test('a serverless case checks, then tests the database, with no service whatever the options say', async () => {
    for (const options of [OFF, { ...OFF, withServices: true }, { ...OFF, withApp: true }, ALL]) {
      const { calls, logs } = await record(`${FN}/default`, options)
      expect(calls).toEqual(['bun ./ok.ts', 'bun ./ok.ts testDb'])
      expect(logs.join('\n')).not.toContain('SKIP')
    }
  })
  test('a serverless case does not run migrate', async () => {
    const { calls } = await record(`${FN}/auth-off`, ALL)
    expect(calls.some((line) => line.includes('migrate'))).toBe(false)
  })
  test('a frontend case in a serverless stack runs its own check and e2e only, with no Docker', async () => {
    const { calls } = await record('frontend/mini-site/default', ALL)
    expect(calls).toEqual(['bun ./ok.ts', 'bun ./ok.ts testE2e'])
    const quiet = await record('frontend/mini-site/default', { ...ALL, e2e: false })
    expect(quiet.calls).toEqual(['bun ./ok.ts'])
    expect(quiet.logs.join('\n')).not.toContain('needs --with')
  })
  test('a lone frontend case runs its check', async () => {
    const { calls } = await record('frontend/mini-site/alone', OFF)
    expect(calls).toEqual(['bun ./ok.ts'])
  })
  test('runs the install itself when post-generate does not', async () => {
    const root = copyFixture('catalog')
    edit(root, FN_TEMPLATE, (t) => t.replace('postGenerate: [install, contract]\n', ''))
    const own = loadCatalog(root)
    const found = listCases(own).find((c) => c.id === `${FN}/default`)
    const calls: string[] = []
    await runCase(
      own,
      found as NonNullable<typeof found>,
      tempDir(),
      OFF,
      (line) => void calls.push(line),
      () => undefined,
    )
    expect(calls).toEqual(['bun ./ok.ts', 'bun ./ok.ts', 'bun ./ok.ts testDb'])
  })
  test('requestFor sets the serverless flags under the two-segment dir', () => {
    const request = requestFor(find('frontend/mini-site/server-auth-off'), 'out')
    expect(request.stack).toBe('mini-site-fn')
    expect(request.answers?.packages).toEqual({
      frontend: { flags: {}, capabilities: {} },
      'serverless/mini-fn': { flags: { auth: false }, capabilities: {} },
    })
    const plan = resolveRequest(
      catalog,
      requestFor(find('frontend/mini-site/server-auth-off'), tempDir()),
    )
    expect(pkgOf(plan, 'serverless/mini-fn').flags).toEqual({ auth: false })
  })
  test('serverDir of a frontend case is the serverless package', () => {
    expect(find('frontend/mini-site/default').serverDir).toBe('serverless/mini-fn')
    expect(find('frontend/mini-site/alone').serverDir).toBeNull()
    expect(find(`${FN}/default`).packageDir).toBeNull()
  })
})
