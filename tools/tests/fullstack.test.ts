// ADR 0014 K1 to K6: the `fullstack` kind, one package that holds the pages and the server code.
// The fixture template is fullstack/mini-app; no real fullstack template is needed to prove the tools.
import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { CatalogError, loadCatalog } from '../lib/catalog'
import { listCases, requestFor } from '../lib/cases'
import { dryRunMarkers } from '../lib/dry-run'
import { generate, packagePlaceholders } from '../lib/generate'
import { PlanError, resolveRequest } from '../lib/plan'
import { runCase, type Options } from '../lib/run-case'
import { validateAgainst } from '../lib/schema'
import { FIXTURE, copyFixture, tempDir } from './helpers'

const catalog = loadCatalog(FIXTURE)
const base = { name: 'Demo', flags: [], capabilities: [], skipPostGenerate: true }
const lone = (extra = {}) => ({ ...base, out: tempDir(), template: 'fullstack/mini-app', ...extra })

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

const read = (out: string, file: string) => readFileSync(path.join(out, 'app', file), 'utf8')
const has = (out: string, file: string) => existsSync(path.join(out, 'app', file))
const TEMPLATE = 'fullstack/mini-app/template.yaml'

describe('the loader (K3, K4)', () => {
  test('loads a fullstack template and its one-package stack', () => {
    expect(catalog.templates.get('fullstack/mini-app')?.manifest.kind).toBe('fullstack')
    expect(catalog.stacks.get('mini-app')?.manifest.packages).toEqual([
      { template: 'fullstack/mini-app', dir: 'app' },
    ])
  })
  test('needs no compose.yaml, and refuses one', () => {
    const root = copyFixture('catalog')
    writeFileSync(path.join(root, 'fullstack/mini-app/compose.yaml'), 'services: {}\n')
    expect(problems(root)).toContain(
      'fullstack/mini-app: compose.yaml is not for a fullstack template, which ships no Docker image; delete it',
    )
  })
  test('requires the headings of the server and of the frontend', () => {
    const message = broken('fullstack/mini-app/base/AGENTS.md', (t) =>
      t.replace('## Adding the data layer\n', '').replace('## Styling\n', ''),
    )
    expect(message).toContain(
      'fullstack/mini-app: agents file base/AGENTS.md lacks the headings "Adding the data layer", "Styling"',
    )
  })
  test('requires lanes', () => {
    const message = broken(
      TEMPLATE,
      (t) =>
        t.slice(0, t.indexOf('lanes:')) + 'gitignore: [node]\n' + t.slice(t.indexOf('agents:')),
    )
    expect(message).toContain(
      'fullstack/mini-app: lanes is required for a fullstack template: say which paths the backend and the frontend role write',
    )
  })
  test('refuses a lane path that is not in base/', () => {
    const message = broken(TEMPLATE, (t) => t.replace('qa: [tests]', 'qa: [tests, nope]'))
    expect(message).toContain('fullstack/mini-app: lanes.qa path "nope" does not exist in base/')
  })
  test('refuses lanes on another kind', () => {
    const message = broken('server/mini/template.yaml', (t) =>
      t.replace(
        'agents:',
        'lanes:\n  backend: [package.json]\n  frontend: [package.json]\nagents:',
      ),
    )
    expect(message).toContain('server/mini: lanes is only for fullstack templates')
  })
  test.each([
    ['static', 'static:\n  out: dist\n', 'static is only for frontend templates'],
    [
      'contract',
      'contract:\n  produces: openapi.json\n',
      'contract is not for a fullstack template',
    ],
    [
      'capabilities',
      'capabilities:\n  database:\n    providers: []\n',
      'capabilities is not for a fullstack template',
    ],
    [
      'onlyWhen',
      'onlyWhen:\n  server: [src/auth.ts]\n',
      'onlyWhen is not for a fullstack template',
    ],
  ])('refuses %s', (_name, block, message) => {
    expect(broken(TEMPLATE, (t) => t.replace('agents:', `${block}agents:`))).toContain(
      `fullstack/mini-app: ${message}`,
    )
  })
  test('requires a brand case', () => {
    const message = broken('fullstack/mini-app/tests/cases.yaml', (t) =>
      t.slice(0, t.indexOf('  - name: brand')),
    )
    expect(message).toContain('fullstack/mini-app: no case sets a brand')
  })
  test('refuses withApp in its cases', () => {
    const message = broken('fullstack/mini-app/tests/cases.yaml', (t) =>
      t.replace('  - name: islands\n', '  - name: islands\n    withApp: true\n'),
    )
    expect(message).toContain(
      'fullstack/mini-app: case "islands" sets withApp, but a fullstack template has no app smoke',
    )
  })
  test('a stack holds one fullstack package and no other', () => {
    const stack = 'stacks/mini-app/stack.yaml'
    const withOther = (template: string, dir: string) => (t: string) =>
      `${t}  - template: ${template}\n    dir: ${dir}\n`
    expect(broken(stack, withOther('server/mini', 'backend'))).toContain(
      'stacks/mini-app: a fullstack package is the whole stack, but it also holds server/mini',
    )
    expect(broken(stack, withOther('frontend/mini-ui', 'frontend'))).toContain(
      'stacks/mini-app: a fullstack package is the whole stack, but it also holds frontend/mini-ui',
    )
    expect(broken(stack, withOther('fullstack/mini-app', 'other'))).toContain(
      'stacks/mini-app: a fullstack package is the whole stack, but it also holds fullstack/mini-app',
    )
  })
  test('a stack of server and frontend loads as before', () => {
    expect(catalog.stacks.get('mini')?.manifest.packages).toHaveLength(2)
  })
})

describe('the two-flag path rule (K5)', () => {
  test('the loader no longer refuses a path two flags list', () => {
    const flags = catalog.templates.get('fullstack/mini-app')?.manifest.flags
    expect(flags?.islands?.onlyPaths).toContain('src/both.ts')
    expect(flags?.auth?.onlyPaths).toContain('src/both.ts')
  })
  test('a flag path overlapping an onlyWhen path is still refused', () => {
    const root = copyFixture('catalog')
    edit(root, 'frontend/mini-spa/template.yaml', (t) =>
      t.replace(
        'gitignore:',
        'onlyWhen:\n  server: [src/client.ts]\nflags:\n  extra:\n    summary: Extra\n    default: true\n    onlyPaths: [src/client.ts]\ngitignore:',
      ),
    )
    expect(problems(root)).toContain('overlap')
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
    generate(catalog, resolveRequest(catalog, lone({ out, flags })))
    expect(has(out, 'src/both.ts')).toBe(both)
    expect(has(out, 'src/islands/login-form.ts')).toBe(form)
    expect(has(out, 'src/islands/island.ts')).toBe(island)
    expect(has(out, 'src/auth.ts')).toBe(auth)
  })
})

describe('the plan (K1, K5)', () => {
  test('a template request and the one-package stack give the same plan', () => {
    const alone = resolveRequest(catalog, lone())
    const stacked = resolveRequest(catalog, { ...lone(), template: undefined, stack: 'mini-app' })
    expect(alone.packages.map((p) => p.dir)).toEqual(['app'])
    expect(stacked.packages.map((p) => p.dir)).toEqual(['app'])
    expect(stacked.stackId).toBe('mini-app')
    expect(alone.deploy).toBeNull()
    expect(stacked.deploy).toBeNull()
  })
  test('carries no server facts, the brand, and the manifest commands as they are', () => {
    const plan = resolveRequest(catalog, lone())
    const [pkg] = plan.packages
    expect(pkg?.serverDir).toBeNull()
    expect(pkg?.serverPort).toBeNull()
    expect(pkg?.frontendDir).toBeNull()
    expect(pkg?.selections.server).toBe(false)
    expect(plan.brand?.inputs.displayName).toBe('Demo')
    expect(plan.ignoredBrand).toEqual([])
    expect(pkg?.commands).toMatchObject({
      testDb: 'bun ./ok.ts testDb',
      migrate: 'bun ./ok.ts migrate',
      e2eDb: 'bun ./ok.ts e2eDb',
    })
    expect(Object.keys(packagePlaceholders(plan, pkg as NonNullable<typeof pkg>))).not.toContain(
      'SERVER_DIR',
    )
  })
  test.each(['single', 'split'])('--deploy %s is refused, naming the reason', (deploy) => {
    expect(() => resolveRequest(catalog, lone({ deploy }))).toThrow(
      /fullstack\/mini-app.*no deploy mode.*ships no Docker image/,
    )
  })
  test('a deploy mode in the answers is refused as well', () => {
    expect(() => resolveRequest(catalog, lone({ answers: { deploy: 'single' } }))).toThrow(
      PlanError,
    )
  })
  test('a fullstack package mixed with another is refused, naming both', () => {
    const mixed = loadCatalog(FIXTURE)
    mixed.stacks.get('mini')?.manifest.packages.push({ template: 'fullstack/mini-app', dir: 'app' })
    expect(() => resolveRequest(mixed, { ...lone(), template: undefined, stack: 'mini' })).toThrow(
      /fullstack\/mini-app.*cannot share a plan with.*server\/mini/,
    )
  })
})

describe('the generator (K5)', () => {
  test('writes no docker-compose.yml and applies the brand', () => {
    const out = tempDir()
    generate(
      catalog,
      resolveRequest(
        catalog,
        lone({
          out,
          answers: { brand: { displayName: 'Orange', primary: '#ea580c', theme: 'dark' } },
        }),
      ),
    )
    expect(existsSync(path.join(out, 'docker-compose.yml'))).toBe(false)
    const theme = read(out, 'src/theme.css')
    expect(theme).toContain('/* Orange | dark |')
    expect(theme).not.toContain('__')
    expect(theme).toContain('--radius:')
    expect(read(out, 'AGENTS.md')).toContain('Project demo.')
    const provenance = parse(readFileSync(path.join(out, '.fullstack/catalog.yaml'), 'utf8'))
    expect(provenance.answers.brand.displayName).toBe('Orange')
    expect(provenance.deploy).toBeUndefined()
  })
  test('the same selection gives the same tree from a template and from the stack', () => {
    const a = tempDir()
    const b = tempDir()
    generate(catalog, resolveRequest(catalog, lone({ out: a })))
    generate(
      catalog,
      resolveRequest(catalog, { ...lone({ out: b }), template: undefined, stack: 'mini-app' }),
    )
    expect(read(a, 'src/pages/index.astro')).toBe(read(b, 'src/pages/index.astro'))
  })
  test('an .astro file takes // markers in its frontmatter and <!-- --> in its markup', () => {
    const on = tempDir()
    generate(catalog, resolveRequest(catalog, lone({ out: on, flags: ['islands=true'] })))
    expect(read(on, 'src/pages/index.astro')).toBe(
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
    generate(catalog, resolveRequest(catalog, lone({ out: off, flags: ['auth=false'] })))
    expect(read(off, 'src/pages/index.astro')).toBe(
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
  test('a .jsonc file takes // markers and its placeholders', () => {
    const out = tempDir()
    generate(catalog, resolveRequest(catalog, lone({ out, flags: ['auth=false'] })))
    const text = read(out, 'wrangler.jsonc')
    expect(text).toContain('"name": "demo"')
    expect(text).toContain('// Cloudflare configuration of demo')
    expect(text).not.toContain('d1_databases')
    expect(text).not.toContain('@')
  })
  test('provenance records the lanes, a directory with a slash, in manifest order', () => {
    const out = tempDir()
    generate(catalog, resolveRequest(catalog, lone({ out })))
    const record = parse(readFileSync(path.join(out, '.fullstack/catalog.yaml'), 'utf8'))
    expect(record.packages.app.lanes).toEqual({
      backend: ['functions/', 'package.json', 'wrangler.jsonc', 'src/auth.ts'],
      frontend: ['src/', 'package.json', 'src/islands/'],
      qa: ['tests/'],
    })
    expect(validateAgainst('provenance', record)).toEqual([])
  })
  test('provenance keeps a lane path that a flag removed from this generation', () => {
    const out = tempDir()
    generate(catalog, resolveRequest(catalog, lone({ out, flags: ['auth=false'] })))
    expect(has(out, 'src/auth.ts')).toBe(false)
    const record = parse(readFileSync(path.join(out, '.fullstack/catalog.yaml'), 'utf8'))
    expect(record.packages.app.lanes.backend).toContain('src/auth.ts')
    expect(record.packages.app.lanes.frontend).toContain('src/islands/')
  })
  test('a package of another kind records no lanes', () => {
    const out = tempDir()
    generate(catalog, resolveRequest(catalog, { ...base, out, stack: 'mini' }))
    const record = parse(readFileSync(path.join(out, '.fullstack/catalog.yaml'), 'utf8'))
    expect(record.packages.backend.lanes).toBeUndefined()
  })
  test('the marker dry-run passes both syntaxes for every flag combination', () => {
    const template = catalog.templates.get('fullstack/mini-app')
    expect(dryRunMarkers(template as NonNullable<typeof template>)).toEqual([])
  })
})

describe('the case runner (K6)', () => {
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

  test('checks, then tests the database, starting no service, whatever the options say', async () => {
    for (const options of [OFF, { ...OFF, withServices: true }, { ...OFF, withApp: true }]) {
      const { calls, logs } = await record('fullstack/mini-app/default', options)
      expect(calls).toEqual(['bun ./ok.ts', 'bun ./ok.ts testDb'])
      expect(logs.join('\n')).not.toContain('SKIP')
      expect(logs.join('\n')).not.toContain('needs --with')
    }
  })
  test('with e2e it also runs testE2e, and still no docker', async () => {
    const { calls } = await record('fullstack/mini-app/islands', ALL)
    expect(calls).toEqual(['bun ./ok.ts', 'bun ./ok.ts testDb', 'bun ./ok.ts testE2e'])
    expect(calls.some((line) => line.startsWith('docker'))).toBe(false)
  })
  test('runs the install itself when post-generate does not', async () => {
    const root = copyFixture('catalog')
    edit(root, TEMPLATE, (t) => t.replace('postGenerate: [install]\n', ''))
    const own = loadCatalog(root)
    const found = listCases(own).find((c) => c.id === 'fullstack/mini-app/default')
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
  test('lists its cases, a template request without a stack and a stack request with one', () => {
    expect(
      listCases(catalog)
        .filter((c) => c.template.path === 'fullstack/mini-app')
        .map((c) => c.name),
    ).toEqual(['auth-off', 'brand', 'default', 'islands', 'islands-auth-off'])
    const flagged = requestFor(find('fullstack/mini-app/islands-auth-off'), 'out')
    expect(flagged.template).toBe('fullstack/mini-app')
    expect(flagged.stack).toBeUndefined()
    expect(flagged.flags).toEqual(['islands=true', 'auth=false'])
    const branded = requestFor(find('fullstack/mini-app/brand'), 'out')
    expect(branded.stack).toBe('mini-app')
    expect(branded.template).toBeUndefined()
    expect(branded.answers?.packages).toEqual({ app: { flags: {}, capabilities: {} } })
    expect(branded.answers?.brand?.primary).toBe('#ea580c')
  })
  test('both request shapes plan the same package', () => {
    const plan = (id: string) => resolveRequest(catalog, requestFor(find(id), tempDir()))
    expect(plan('fullstack/mini-app/brand').packages[0]?.dir).toBe('app')
    expect(plan('fullstack/mini-app/default').packages[0]?.dir).toBe('app')
  })
})
