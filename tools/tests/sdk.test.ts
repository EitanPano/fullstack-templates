import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { CatalogError, loadCatalog } from '../lib/catalog'
import { listCases, requestFor } from '../lib/cases'
import { dryRunMarkers } from '../lib/dry-run'
import { generate } from '../lib/generate'
import { PlanError, parseSdkArg, resolveRequest, type RequestInput } from '../lib/plan'
import { runCase, type Options } from '../lib/run-case'
import { FIXTURE, copyFixture, tempDir } from './helpers'

// Several tests copy and load the fixture catalog more than once; a loaded machine crosses 5 s.
setDefaultTimeout(30_000)

const catalog = loadCatalog(FIXTURE)
const base = { out: 'C:/tmp/x', name: 'Demo', flags: [], capabilities: [], skipPostGenerate: true }
const sdk = (dir = 'sdk-x') => [{ dir, template: 'sdk/mini-sdk' }]
const plan = (extra: Partial<RequestInput>) => resolveRequest(catalog, { ...base, ...extra })

function edited(edits: Record<string, (text: string) => string>) {
  const root = copyFixture('catalog')
  for (const [rel, change] of Object.entries(edits)) {
    const file = path.join(root, rel)
    writeFileSync(file, change(readFileSync(file, 'utf8')))
  }
  return root
}

function build(extra: Partial<RequestInput>, root?: string) {
  const out = tempDir()
  const loaded = root === undefined ? catalog : loadCatalog(root)
  generate(loaded, resolveRequest(loaded, { ...base, out, ...extra }))
  return out
}
const read = (out: string, ...parts: string[]) => readFileSync(path.join(out, ...parts), 'utf8')

describe('the sdk request', () => {
  test('parses <dir>=<template> and names the form on a bad value', () => {
    expect(parseSdkArg('sdk-x=sdk/mini-sdk')).toEqual({ dir: 'sdk-x', template: 'sdk/mini-sdk' })
    expect(() => parseSdkArg('sdk-x')).toThrow(/--sdk must read <dir>=<template>/)
  })

  test('adds the package beside a stack and never counts it as a frontend', () => {
    const p = plan({ stack: 'mini', sdks: sdk() })
    expect(p.packages.map((x) => x.dir)).toEqual(['backend', 'frontend', 'sdk-x'])
    expect(p.frontends.map((x) => x.dir)).toEqual(['frontend'])
    expect(p.sdk?.dir).toBe('sdk-x')
    expect(p.deploy).toBe('split')
    expect(p.brand).not.toBeNull()
    expect(plan({ stack: 'mini' }).sdk).toBeNull()
  })

  test('puts the sdk after the server, as its contract consumer', () => {
    const p = plan({ stack: 'mini', sdks: sdk() })
    expect(p.packages.findIndex((x) => x.dir === 'backend')).toBeLessThan(
      p.packages.findIndex((x) => x.dir === 'sdk-x'),
    )
  })

  test('is true for every package of a plan that holds one, false otherwise', () => {
    for (const pkg of plan({ stack: 'mini', sdks: sdk() }).packages) {
      expect(pkg.selections.sdk).toBe(true)
    }
    for (const pkg of plan({ stack: 'mini' }).packages) expect(pkg.selections.sdk).toBe(false)
  })

  test('refuses an sdk without a stack', () => {
    expect(() => plan({ sdks: sdk() })).toThrow(/--sdk needs --stack/)
  })

  test('refuses an sdk with --template', () => {
    expect(() => plan({ template: 'server/mini', sdks: sdk() })).toThrow(
      /--sdk cannot be combined with --template/,
    )
  })

  test('refuses a second sdk', () => {
    expect(() => plan({ stack: 'mini', sdks: [...sdk('sdk-a'), ...sdk('sdk-b')] })).toThrow(
      /--sdk is given twice/,
    )
  })

  test('refuses a template that is not an sdk', () => {
    expect(() =>
      plan({ stack: 'mini', sdks: [{ dir: 'sdk-x', template: 'frontend/mini-ui' }] }),
    ).toThrow(/frontend\/mini-ui is not an sdk template, it is a frontend/)
    expect(() => plan({ stack: 'mini', sdks: [{ dir: 'sdk-x', template: 'sdk/nope' }] })).toThrow(
      /unknown template: sdk\/nope/,
    )
  })

  test('refuses an sdk template as a --frontend or as a lone --template', () => {
    expect(() =>
      plan({ stack: 'mini', frontends: [{ dir: 'f', template: 'sdk/mini-sdk' }] }),
    ).toThrow(/sdk\/mini-sdk is not a frontend template, it is a sdk/)
    expect(() => plan({ template: 'sdk/mini-sdk' })).toThrow(/joins a plan with --sdk/)
  })

  test('refuses a directory another package holds or sits in', () => {
    expect(() => plan({ stack: 'mini', sdks: sdk('backend') })).toThrow(
      /package dir "backend" is used by both/,
    )
    expect(() => plan({ stack: 'mini', sdks: sdk('Bad Dir') })).toThrow(/invalid package dir/)
    expect(() => plan({ stack: 'mini', sdks: sdk('backend/x') })).toThrow(PlanError)
  })

  test('is allowed beside a serverless API and a server with a static frontend', () => {
    expect(plan({ stack: 'mini-site-fn', sdks: sdk() }).packages).toHaveLength(3)
    const spa = plan({ stack: 'mini-spa', sdks: sdk() })
    expect(spa.deploy).toBe('single')
    expect(spa.frontends).toHaveLength(1)
  })

  test('gives the sdk its own port from the template', () => {
    expect(plan({ stack: 'mini', sdks: sdk() }).sdk?.port).toBe(5180)
  })
})

describe('the sdk selection in a generated tree', () => {
  test('keeps lines and files marked sdk only when the plan holds one', () => {
    const on = build({ stack: 'mini', sdks: sdk() })
    const off = build({ stack: 'mini' })
    expect(read(on, 'backend', 'src', 'sdk.ts')).toContain("sdkDir = 'sdk-x'")
    expect(read(on, 'backend', 'src', 'sdk.ts')).not.toContain('noSdk')
    expect(existsSync(path.join(on, 'backend', 'src', 'sdk-key.ts'))).toBe(true)
    expect(read(off, 'backend', 'src', 'sdk.ts')).toContain('noSdk')
    expect(read(off, 'backend', 'src', 'sdk.ts')).not.toContain('sdkDir')
    expect(existsSync(path.join(off, 'backend', 'src', 'sdk-key.ts'))).toBe(false)
  })

  test('does the same for a serverless package', () => {
    const on = build({ stack: 'mini-site-fn', sdks: sdk() })
    const off = build({ stack: 'mini-site-fn' })
    expect(existsSync(path.join(on, 'serverless', 'mini-fn', 'src', 'sdk-key.ts'))).toBe(true)
    expect(existsSync(path.join(off, 'serverless', 'mini-fn', 'src', 'sdk-key.ts'))).toBe(false)
    expect(read(off, 'serverless', 'mini-fn', 'src', 'frontends.ts')).not.toContain('sdkPath')
  })

  test('refuses a flag named sdk', () => {
    const root = edited({
      'server/mini/template.yaml': (t) =>
        t.replace('flags:\n', 'flags:\n  sdk:\n    summary: x\n    default: false\n'),
    })
    expect(() => loadCatalog(root)).toThrow(CatalogError)
  })
})

describe('the sdk placeholders', () => {
  test('give the server its four values', () => {
    const src = read(build({ stack: 'mini', sdks: sdk() }), 'backend', 'src', 'sdk.ts')
    expect(src).toContain("sdkDir = 'sdk-x'")
    expect(src).toContain("sdkPath = '../sdk-x'")
    expect(src).toContain("sdkOut = 'dist/cdn'")
    expect(src).toContain("sdkPort = '5180'")
  })

  test('give a serverless package a path from its own directory', () => {
    const src = read(
      build({ stack: 'mini-site-fn', sdks: sdk() }),
      'serverless',
      'mini-fn',
      'src',
      'frontends.ts',
    )
    expect(src).toContain("sdkPath = '../../sdk-x'")
    expect(src).toContain("sdkDir = 'sdk-x'")
  })

  test('give the sdk what a frontend gets about the server, its own dir and port', () => {
    const src = read(build({ stack: 'mini', sdks: sdk() }), 'sdk-x', 'src', 'index.ts')
    expect(src).toContain("serverDir = 'backend'")
    expect(src).toContain("serverPort = '4000'")
    expect(src).toContain("start = 'bun ./ok.ts start'")
    expect(src).toContain("packageDir = 'sdk-x'")
    expect(src).toContain("port = '5180'")
  })

  test('name the file when an unguarded use meets a plan without an sdk', () => {
    const root = edited({
      'server/mini/base/src/sdk.ts': (t) => `${t}export const bad = '__SDK_PATH__'\n`,
    })
    expect(() => build({ stack: 'mini' }, root)).toThrow(
      /src\/sdk\.ts: unreplaced placeholder __SDK_PATH__/,
    )
  })

  test.each([
    ['sdk-ads', 'AdsSdk'],
    ['sdk-two-words', 'TwoWordsSdk'],
    ['sdk-browser', 'BrowserSdk'],
    ['sdk', 'Sdk'],
    ['ads-sdk', 'AdsSdk'],
  ])('derive the global of %s as %s', (dir, global) => {
    const out = build({ stack: 'mini', sdks: sdk(dir) })
    expect(read(out, dir, 'src', 'index.ts')).toContain(`globalName = '${global}'`)
    expect(read(out, dir, 'AGENTS.md')).toContain(`global ${global}.`)
  })
})

describe('the sdk global must be an identifier', () => {
  test.each(['sdk-', 'sdk-2fa'])('refuses the directory %s before anything is staged', (dir) => {
    expect(() => plan({ stack: 'mini', sdks: sdk(dir) })).toThrow(
      new RegExp(`sdk directory "${dir}".*after sdk- must start with a letter`),
    )
  })
})

describe('provenance and compose', () => {
  test('records the sdk package like any other', () => {
    const out = build({ stack: 'mini', sdks: sdk() })
    const record = parse(read(out, '.fullstack', 'catalog.yaml')) as {
      packages: Record<string, Record<string, unknown>>
    }
    const entry = record.packages['sdk-x']
    expect(entry?.template).toBe('sdk/mini-sdk')
    expect(entry?.version).toBe('1.0.0')
    expect(entry?.http).toEqual({ port: 5180, health: '/' })
    expect((entry?.commands as Record<string, string>).check).toBe('bun ./ok.ts')
    expect(entry).not.toHaveProperty('type')
  })

  test.each(['single', 'split'])('joins the Compose file with a server in %s', (deploy) => {
    const out = build({ stack: 'mini-spa', sdks: sdk(), deploy })
    const compose = parse(read(out, 'docker-compose.yml')) as {
      services: Record<string, { build: { context: string; target: string } }>
    }
    expect(compose.services['sdk-x']?.build).toEqual({ context: './sdk-x', target: 'dist' })
  })

  test('leaves the fragment out beside a serverless API', () => {
    const out = build({ stack: 'mini-site-fn', sdks: sdk() })
    expect(existsSync(path.join(out, 'docker-compose.yml'))).toBe(false)
    expect(existsSync(path.join(out, 'sdk-x', 'package.json'))).toBe(true)
  })
})

describe('the loader checks of an sdk template', () => {
  const tpl = 'sdk/mini-sdk/template.yaml'
  test('requires the five headings', () => {
    const root = edited({ 'sdk/mini-sdk/base/AGENTS.md': (t) => t.replace('## Public API\n', '') })
    expect(() => loadCatalog(root)).toThrow(/sdk\/mini-sdk.*lacks the headings "Public API"/s)
  })
  test('requires a default case', () => {
    const root = edited({
      'sdk/mini-sdk/tests/cases.yaml': (t) => t.replace('name: default', 'name: other'),
    })
    expect(() => loadCatalog(root)).toThrow(/no case named "default"/)
  })
  test('requires cdn.out', () => {
    const root = edited({ [tpl]: (t) => t.replace('cdn:\n  out: dist/cdn\n', '') })
    expect(() => loadCatalog(root)).toThrow(/cdn.*required/)
  })
  test('refuses static, capabilities and a brand case', () => {
    expect(() => loadCatalog(edited({ [tpl]: (t) => `${t}static:\n  out: dist\n` }))).toThrow(
      /static is only for frontend/,
    )
    expect(() =>
      loadCatalog(edited({ [tpl]: (t) => `${t}capabilities:\n  database:\n    providers: []\n` })),
    ).toThrow(/capabilities is not for an sdk template/)
    const brand = edited({
      'sdk/mini-sdk/tests/cases.yaml': (t) => `${t}  - name: b\n    brand:\n      radius: sm\n`,
    })
    expect(() => loadCatalog(brand)).toThrow(/brand/)
  })
  test('refuses cdn on another kind and a stack that lists an sdk', () => {
    expect(() =>
      loadCatalog(edited({ 'server/mini/template.yaml': (t) => `${t}cdn:\n  out: dist\n` })),
    ).toThrow(/cdn is only for sdk templates/)
    const stack = edited({
      'stacks/mini/stack.yaml': (t) => `${t}  - template: sdk/mini-sdk\n    dir: sdk-x\n`,
    })
    expect(() => loadCatalog(stack)).toThrow(/no stack lists an sdk/)
  })
  test('refuses a case sdk that is no sdk template, and a case sdk without a stack', () => {
    const cases = 'server/mini/tests/cases.yaml'
    const notSdk = edited({ [cases]: (t) => t.replace('sdk-x=sdk/mini-sdk', 'sdk-x=sdk/ghost') })
    expect(() => loadCatalog(notSdk)).toThrow(/is not an sdk template/)
    const noStack = edited({ [cases]: (t) => t.replace('    stack: mini\n    sdk:', '    sdk:') })
    expect(() => loadCatalog(noStack)).toThrow(/names no stack/)
  })
})

describe('onlyWhen sdk on an API template', () => {
  const server = 'server/mini/template.yaml'
  test('loads on a server and a serverless manifest', () => {
    expect(() => loadCatalog(FIXTURE)).not.toThrow()
  })
  test('accepts the object form', () => {
    const root = edited({
      [server]: (t) =>
        t.replace('  sdk: [src/sdk-key.ts]', '  sdk:\n    onlyPaths: [src/sdk-key.ts]'),
    })
    expect(() => loadCatalog(root)).not.toThrow()
  })
  test('refuses a path that is not in base', () => {
    const root = edited({ [server]: (t) => t.replace('src/sdk-key.ts]', 'src/nope.ts]') })
    expect(() => loadCatalog(root)).toThrow(/onlyWhen "sdk" path "src\/nope\.ts"/)
  })
  test('refuses a dependency a flag already removes', () => {
    const root = edited({
      [server]: (t) =>
        t.replace('  sdk: [src/sdk-key.ts]', '  sdk:\n    dependencies:\n      remove: [jose]'),
    })
    expect(() => loadCatalog(root)).toThrow(/onlyWhen "sdk" dependency "jose".*flag "auth"/s)
  })
  test('removes a dependency while the plan holds no sdk', () => {
    const root = edited({
      [server]: (t) =>
        t.replace(
          '  sdk: [src/sdk-key.ts]',
          '  sdk:\n    onlyPaths: [src/sdk-key.ts]\n    dependencies:\n      remove: [left-pad]',
        ),
      'server/mini/base/package.json': (t) =>
        t.replace('"devDependencies": {}', '"devDependencies": { "left-pad": "^1" }'),
    })
    const off = build({ stack: 'mini', flags: ['auth=true'] }, root)
    expect(read(off, 'backend', 'package.json')).not.toContain('left-pad')
    const on = build({ stack: 'mini', sdks: sdk() }, root)
    expect(read(on, 'backend', 'package.json')).toContain('left-pad')
  })
  test('refuses any other key on a server and the sdk key on a frontend', () => {
    expect(() =>
      loadCatalog(edited({ [server]: (t) => t.replace('  sdk:', '  server:auth:') })),
    ).toThrow(/onlyWhen/)
    const frontend = edited({
      'frontend/mini-ui/template.yaml': (t) =>
        t.replace('gitignore:', 'onlyWhen:\n  sdk: [src/client.ts]\ngitignore:'),
    })
    expect(() => loadCatalog(frontend)).toThrow(/onlyWhen/)
  })
  test('dry-runs both states without a problem', () => {
    for (const id of ['server/mini', 'serverless/mini-fn', 'sdk/mini-sdk']) {
      expect(dryRunMarkers(catalog.templates.get(id)!)).toEqual([])
    }
  })
  test('the dry-run reports an sdk marker that only one state removes badly', () => {
    const root = edited({ 'server/mini/base/src/sdk-key.ts': () => 'x // @sdk-start\n' })
    expect(dryRunMarkers(loadCatalog(root).templates.get('server/mini')!)).not.toEqual([])
  })
})

describe('the sdk cases', () => {
  test('an sdk template case adds the template at sdk-<id> on its default stack', () => {
    const c = listCases(catalog).find((x) => x.id === 'sdk/mini-sdk/default')
    expect(c?.stack).toBe('mini')
    expect(c?.packageDir).toBe('sdk-mini-sdk')
    expect(c?.sdk).toBe('sdk-mini-sdk=sdk/mini-sdk')
    expect(c?.serverDir).toBe('backend')
    const request = requestFor(c!, 'C:/tmp/o')
    expect(request.stack).toBe('mini')
    expect(request.sdks).toEqual([{ dir: 'sdk-mini-sdk', template: 'sdk/mini-sdk' }])
  })
  test('an sdk case may name another stack', () => {
    const c = listCases(catalog).find((x) => x.id === 'sdk/mini-sdk/fn')
    expect(c?.stack).toBe('mini-site-fn')
    expect(c?.serverDir).toBe('serverless/mini-fn')
  })
  test('a stack case carries its sdk', () => {
    const cases = listCases(catalog)
    const c = cases.find((x) => x.id === 'server/mini/with-sdk')
    expect(c?.sdk).toBe('sdk-x=sdk/mini-sdk')
    expect(requestFor(c!, 'C:/tmp/o').sdks).toEqual([{ dir: 'sdk-x', template: 'sdk/mini-sdk' }])
    expect(
      requestFor(
        cases.find((x) => x.id === 'server/mini/default')!,
        'o',
      ).sdks,
    ).toBeUndefined()
  })
})

describe('runCase with an sdk', () => {
  const OFF: Options = {
    e2e: false,
    installBrowsers: false,
    keep: false,
    withServices: false,
    withApp: false,
  }
  const find = (id: string) => listCases(catalog).find((c) => c.id === id)!
  const record = () => {
    const calls: { line: string; cwd: string }[] = []
    const logs: string[] = []
    return {
      calls,
      logs,
      run: (line: string, cwd: string) => void calls.push({ line, cwd }),
      log: (m: string) => void logs.push(m),
    }
  }
  const sdkCalls = (calls: { line: string; cwd: string }[]) =>
    calls.filter((c) => path.basename(c.cwd).startsWith('sdk-'))

  test('an sdk case runs the sdk check, and its e2e only with --e2e', async () => {
    const a = record()
    await runCase(catalog, find('sdk/mini-sdk/default'), tempDir(), OFF, a.run, a.log)
    expect(sdkCalls(a.calls).map((c) => c.line)).toEqual(['bun ./ok.ts'])
    const b = record()
    const e2e = { ...OFF, e2e: true }
    await runCase(catalog, find('sdk/mini-sdk/default'), tempDir(), e2e, b.run, b.log)
    expect(sdkCalls(b.calls).map((c) => c.line)).toEqual(['bun ./ok.ts', 'bun ./ok.ts e2e'])
  })
  test('installs the browsers for the sdk e2e when asked', async () => {
    const a = record()
    const options = { ...OFF, e2e: true, installBrowsers: true }
    await runCase(catalog, find('sdk/mini-sdk/default'), tempDir(), options, a.run, a.log)
    const install = `bun x playwright install ${process.platform === 'linux' ? '--with-deps ' : ''}chromium firefox webkit`
    expect(sdkCalls(a.calls).map((c) => c.line)).toEqual([
      'bun ./ok.ts',
      install,
      'bun ./ok.ts e2e',
    ])
  })
  test('a server case with an sdk runs the server gates and skips the sdk package', async () => {
    const a = record()
    await runCase(catalog, find('server/mini/with-sdk'), tempDir(), OFF, a.run, a.log)
    expect(sdkCalls(a.calls)).toEqual([])
    expect(a.logs).toContain('SKIP sdk-x: its own cases run its gates')
    expect(a.calls.some((c) => path.basename(c.cwd) === 'backend')).toBe(true)
  })
  test('an sdk case beside a serverless API skips that package as before', async () => {
    const a = record()
    await runCase(catalog, find('sdk/mini-sdk/fn'), tempDir(), OFF, a.run, a.log)
    expect(a.logs).toContain('SKIP serverless/mini-fn: its own cases run its gates')
  })
})
