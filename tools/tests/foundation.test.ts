import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { loadCatalog } from '../lib/catalog'
import { listCases, requestFor } from '../lib/cases'
import { dryRunMarkers } from '../lib/dry-run'
import { generate } from '../lib/generate'
import { resolveRequest } from '../lib/plan'
import { validateAgainst } from '../lib/schema'
import { FIXTURE, copyFixture, tempDir } from './helpers'

const catalog = loadCatalog(FIXTURE)
const request = (out: string, extra = {}) => ({
  out,
  name: 'Demo',
  flags: [],
  capabilities: [],
  skipPostGenerate: true,
  stack: 'mini',
  ...extra,
})
const read = (out: string, ...parts: string[]) => readFileSync(path.join(out, ...parts), 'utf8')
const aloneUi = { stack: undefined, template: 'frontend/mini-ui' }

describe('generation with a brand', () => {
  test('substitutes the theme placeholders into a css file of the frontend', () => {
    const out = tempDir()
    const brand = {
      displayName: 'My Shop',
      radius: 'lg',
      theme: 'dark',
      font: 'inter',
      density: 'compact',
    }
    generate(catalog, resolveRequest(catalog, request(out, { brand })))
    const css = read(out, 'frontend', 'src', 'theme.css')
    expect(css).toContain('  --background: oklch(1 0 0);')
    expect(css).toContain('--radius: 0.75rem;')
    expect(css).toMatch(/\.dark \{\n {2}--background: oklch\(0\.1\d* /)
    expect(css).toContain('/* My Shop | dark | compact | inter */')
    expect(css).toContain("--font-sans: 'Inter Variable', ui-sans-serif,")
    expect(css).not.toContain('__')
  })

  test('uses the defaults without a brand input', () => {
    const out = tempDir()
    generate(catalog, resolveRequest(catalog, request(out)))
    expect(read(out, 'frontend', 'src', 'theme.css')).toContain(
      '/* Demo | system | comfortable | system */',
    )
  })

  test('records answers.brand in the provenance, valid against the schema', () => {
    const out = tempDir()
    generate(catalog, resolveRequest(catalog, request(out, { brand: { primary: '#ff0000' } })))
    const provenance = parse(read(out, '.fullstack', 'catalog.yaml'))
    expect(provenance.answers.projectName).toBe('demo')
    expect(provenance.answers.brand).toEqual({
      displayName: 'Demo',
      primary: '#ff0000',
      neutral: '#64748b',
      radius: 'md',
      font: 'system',
      theme: 'system',
      density: 'comfortable',
    })
    expect(validateAgainst('provenance', provenance)).toEqual([])
  })

  test('a server-only provenance has no brand', () => {
    const out = tempDir()
    const extra = { stack: undefined, template: 'server/mini' }
    generate(catalog, resolveRequest(catalog, request(out, extra)))
    expect(parse(read(out, '.fullstack', 'catalog.yaml')).answers).toEqual({ projectName: 'demo' })
  })

  test('the provenance schema refuses an unknown brand field and a bad radius', () => {
    const out = tempDir()
    generate(catalog, resolveRequest(catalog, request(out)))
    const provenance = parse(read(out, '.fullstack', 'catalog.yaml'))
    provenance.answers.brand.colour = 'red'
    expect(validateAgainst('provenance', provenance)).not.toEqual([])
    delete provenance.answers.brand.colour
    provenance.answers.brand.radius = 'xl'
    expect(validateAgainst('provenance', provenance)).not.toEqual([])
  })
})

describe('onlyWhen and server markers', () => {
  const generated = (extra: object) => {
    const out = tempDir()
    generate(catalog, resolveRequest(catalog, request(out, extra)))
    return out
  }

  test('keeps the files and lines while the server flag is on', () => {
    const out = generated({})
    expect(existsSync(path.join(out, 'frontend', 'src', 'session.ts'))).toBe(true)
    const client = read(out, 'frontend', 'src', 'client.ts')
    expect(client).toContain('signedIn')
    expect(client).not.toContain('signedOut')
  })

  test('drops the files and flips the lines when the server has auth off', () => {
    const out = generated({ flags: ['auth=false'] })
    expect(existsSync(path.join(out, 'frontend', 'src', 'session.ts'))).toBe(false)
    const client = read(out, 'frontend', 'src', 'client.ts')
    expect(client).toContain('signedOut')
    expect(client).not.toContain('signedIn')
  })

  test('an alone frontend has every server:* selection off', () => {
    const out = generated(aloneUi)
    expect(existsSync(path.join(out, 'frontend', 'src', 'session.ts'))).toBe(false)
    expect(read(out, 'frontend', 'src', 'client.ts')).toContain('signedOut')
  })

  test('a server capability turns server:database on for the frontend', () => {
    const root = copyFixture('catalog')
    const line = 'export const db = true // @server:database\n'
    writeFileSync(path.join(root, 'frontend', 'mini-ui', 'base', 'src', 'db.ts'), line)
    const loaded = loadCatalog(root)
    const on = tempDir()
    generate(loaded, resolveRequest(loaded, request(on, { capabilities: ['database=fake'] })))
    expect(read(on, 'frontend', 'src', 'db.ts')).toContain('export const db')
    const off = tempDir()
    generate(loaded, resolveRequest(loaded, request(off)))
    expect(read(off, 'frontend', 'src', 'db.ts').trim()).toBe('')
  })
})

describe('the dry run covers the server selections', () => {
  const edit = (files: Record<string, string>) => {
    const root = copyFixture('catalog')
    for (const [rel, content] of Object.entries(files)) writeFileSync(path.join(root, rel), content)
    return loadCatalog(root)
  }
  const names = ['auth', 'database']
  const dry = (files: Record<string, string>) =>
    dryRunMarkers(edit(files).templates.get('frontend/mini-ui')!, names)

  test('is clean on the fixture frontend', () => {
    expect(dryRunMarkers(catalog.templates.get('frontend/mini-ui')!, names)).toEqual([])
  })

  test('accepts server:<name> markers in line and block form', () => {
    const content = [
      'a // @server:auth',
      'b // @noserver:database',
      '// @server:auth-start',
      'c',
      '// @server:auth-end',
      '',
    ].join('\n')
    expect(dry({ 'frontend/mini-ui/base/src/m.ts': content })).toEqual([])
  })

  test('reports a server name that no server declares', () => {
    expect(dry({ 'frontend/mini-ui/base/src/m.ts': 'a // @server:payments\n' })).toContain(
      'base/src/m.ts:1: unknown marker name "server:payments"',
    )
  })

  test('without the names the marker is unknown', () => {
    const files = { 'frontend/mini-ui/base/src/m.ts': 'a // @server:auth\n' }
    const template = edit(files).templates.get('frontend/mini-ui')!
    expect(dryRunMarkers(template)).toContain('base/src/m.ts:1: unknown marker name "server:auth"')
  })

  test('a server template does not get server:* names', () => {
    const files = { 'server/mini/base/src/m.ts': 'a // @server:auth\n' }
    const server = edit(files).templates.get('server/mini')!
    expect(dryRunMarkers(server, names)).toContain(
      'base/src/m.ts:1: unknown marker name "server:auth"',
    )
  })
})

describe('catalog checks of onlyWhen and case server settings', () => {
  const load = (edits: Record<string, (text: string) => string>) => {
    const root = copyFixture('catalog')
    for (const [rel, change] of Object.entries(edits)) {
      const file = path.join(root, rel)
      writeFileSync(file, change(readFileSync(file, 'utf8')))
    }
    return () => loadCatalog(root)
  }
  const ui = 'frontend/mini-ui/template.yaml'
  const cases = 'frontend/mini-ui/tests/cases.yaml'

  test('refuses an onlyWhen path that is not in base', () => {
    const change = load({ [ui]: (t) => t.replace('[src/session.ts]', '[src/nope.ts]') })
    expect(change).toThrow(/onlyWhen.*server:auth.*src\/nope\.ts/s)
  })
  test('refuses an onlyWhen name no server template declares', () => {
    expect(load({ [ui]: (t) => t.replace('server:auth:', 'server:payments:') })).toThrow(
      /server:payments/,
    )
  })
  test('refuses onlyWhen on a server template', () => {
    const add = (t: string) =>
      t.replace('gitignore:', 'onlyWhen:\n  server:auth: [src/auth.ts]\ngitignore:')
    expect(load({ 'server/mini/template.yaml': add })).toThrow(/onlyWhen/)
  })
  test('refuses a name that is not server:<name>', () => {
    expect(load({ [ui]: (t) => t.replace('server:auth:', 'auth:') })).toThrow(/onlyWhen/)
  })
  test('refuses a case server flag the server does not declare', () => {
    expect(load({ [cases]: (t) => t.replace('auth: false', 'oauth: false') })).toThrow(/oauth/)
  })
  test('refuses a case server capability that is not declared or not listed', () => {
    expect(load({ [cases]: (t) => t.replace('database: fake', 'database: nope') })).toThrow(/nope/)
    expect(load({ [cases]: (t) => t.replace('database: fake', 'cache: redis') })).toThrow(/cache/)
  })
  test('refuses server settings on a case without a stack', () => {
    const drop = (t: string) =>
      t.replace('- name: auth-off\n    stack: mini\n', '- name: auth-off\n')
    expect(load({ [cases]: drop })).toThrow(/stack/)
  })
  test('refuses server settings on a server template case', () => {
    const add = (t: string) => t + '  - name: bad\n    server:\n      flags:\n        auth: false\n'
    expect(load({ 'server/mini/tests/cases.yaml': add })).toThrow(/server settings/)
  })
  test('the schema refuses an unknown key under server', () => {
    const typo = (t: string) =>
      t.replace('flags:\n        auth: false', 'flag:\n        auth: false')
    expect(load({ [cases]: typo })).toThrow()
  })
})

describe('frontend cases that set the server', () => {
  const all = listCases(catalog)
  const find = (id: string) => all.find((c) => c.id === id)!

  test('lists the server settings and the server directory', () => {
    const off = find('frontend/mini-ui/auth-off')
    expect(off.serverDir).toBe('backend')
    expect(off.serverFlags).toEqual({ auth: false })
    expect(off.serverCapabilities).toEqual({})
    expect(find('frontend/mini-ui/fake').serverCapabilities).toEqual({ database: 'fake' })
    expect(find('frontend/mini-ui/default').serverDir).toBe('backend')
    expect(find('frontend/mini-ui/alone').serverDir).toBeNull()
  })

  test('passes them into the answers of the server package, not the frontend', () => {
    const off = requestFor(find('frontend/mini-ui/auth-off'), 'out')
    expect(off.answers?.packages).toEqual({
      frontend: { flags: {}, capabilities: {} },
      backend: { flags: { auth: false }, capabilities: {} },
    })
    const fake = requestFor(find('frontend/mini-ui/fake'), 'out')
    expect(fake.answers?.packages?.backend).toEqual({
      flags: {},
      capabilities: { database: 'fake' },
    })
  })

  test('the resolved plan applies them', () => {
    const plan = resolveRequest(catalog, requestFor(find('frontend/mini-ui/auth-off'), 'out'))
    expect(plan.packages.find((p) => p.dir === 'backend')?.flags).toEqual({ auth: false })
    expect(plan.packages.find((p) => p.dir === 'frontend')?.selections['server:auth']).toBe(false)
    const fake = resolveRequest(catalog, requestFor(find('frontend/mini-ui/fake'), 'out'))
    expect(fake.packages.find((p) => p.dir === 'backend')?.capabilities).toEqual({
      database: 'fake',
    })
  })

  test('a case without server settings keeps the old answers shape', () => {
    expect(requestFor(find('frontend/mini-ui/default'), 'out').answers?.packages).toEqual({
      frontend: { flags: {}, capabilities: {} },
    })
  })
})

describe('the command names and schemas', () => {
  const manifest = {
    schemaVersion: 1,
    id: 'x',
    kind: 'server',
    name: 'X',
    version: '1.0.0',
    summary: 's',
    runtime: { language: 'typescript', platform: 'bun' },
    tools: [{ name: 'bun' }],
    placeholders: [],
    commands: { check: 'bun run check', e2eDb: 'bun run db:e2e' },
    agents: 'AGENTS.md',
  }

  test('e2eDb is a command of a template and of a capability overlay', () => {
    expect(validateAgainst('template', manifest)).toEqual([])
    const overlay = {
      schemaVersion: 1,
      kind: 'database',
      provider: 'postgres',
      summary: 's',
      commands: { e2eDb: 'bun run db:e2e' },
    }
    expect(validateAgainst('capability', overlay)).toEqual([])
  })

  test('e2eDb is not a post-generate step', () => {
    expect(validateAgainst('template', { ...manifest, postGenerate: ['e2eDb'] })).not.toEqual([])
  })

  test('a template accepts onlyWhen with server: names only', () => {
    const ok = { ...manifest, kind: 'frontend', onlyWhen: { 'server:auth': ['src/a.ts'] } }
    expect(validateAgainst('template', ok)).toEqual([])
    const bare = { ...ok, onlyWhen: { auth: ['src/a.ts'] } }
    expect(validateAgainst('template', bare)).not.toEqual([])
    const escape = { ...ok, onlyWhen: { 'server:auth': ['../a.ts'] } }
    expect(validateAgainst('template', escape)).not.toEqual([])
  })

  test('a case may carry server flags and capabilities', () => {
    const server = { flags: { auth: false }, capabilities: { database: 'postgres' } }
    const file = { schemaVersion: 1, cases: [{ name: 'x', stack: 's', server }] }
    expect(validateAgainst('cases', file)).toEqual([])
    const typo = { schemaVersion: 1, cases: [{ name: 'x', server: { flag: {} } }] }
    expect(validateAgainst('cases', typo)).not.toEqual([])
  })
})

describe('the generate CLI brand options', () => {
  const cli = path.join(import.meta.dir, '..', 'generate.ts')
  const run = (args: string[]) => spawnSync('bun', [cli, ...args], { encoding: 'utf8' })
  const common = (out: string) => [
    '--stack',
    'mini',
    '--out',
    out,
    '--name',
    'Demo',
    '--catalog',
    FIXTURE,
    '--skip-post-generate',
  ]

  test('accepts every option and records them', () => {
    const out = tempDir()
    const result = run([
      ...common(out),
      '--display-name',
      'Studio Booking',
      '--brand-primary',
      '#0f766e',
      '--brand-neutral',
      '#78716c',
      '--radius',
      'sm',
      '--font',
      'inter',
      '--theme',
      'light',
      '--density',
      'compact',
    ])
    expect(result.status).toBe(0)
    expect(parse(read(out, '.fullstack', 'catalog.yaml')).answers.brand).toEqual({
      displayName: 'Studio Booking',
      primary: '#0f766e',
      neutral: '#78716c',
      radius: 'sm',
      font: 'inter',
      theme: 'light',
      density: 'compact',
    })
    expect(read(out, 'frontend', 'src', 'theme.css')).toContain(
      '/* Studio Booking | light | compact | inter */',
    )
  })

  test('takes answers.brand from the answers file, and an option wins', () => {
    const out = tempDir()
    const answers = path.join(tempDir(), 'answers.json')
    writeFileSync(answers, JSON.stringify({ brand: { displayName: 'File Name', radius: 'lg' } }))
    const result = run([...common(out), '--answers', answers, '--radius', 'sm'])
    expect(result.status).toBe(0)
    const brand = parse(read(out, '.fullstack', 'catalog.yaml')).answers.brand
    expect(brand.displayName).toBe('File Name')
    expect(brand.radius).toBe('sm')
  })

  test('exits 1 with the option name on a bad value, and writes nothing', () => {
    const out = tempDir()
    const result = run([...common(out), '--brand-primary', 'blue'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('--brand-primary')
    expect(existsSync(path.join(out, 'frontend'))).toBe(false)
  })

  test('an option without a value is a usage error', () => {
    expect(run([...common(tempDir()), '--radius']).status).toBe(2)
  })
})

describe('the provider e2e database', () => {
  const entry = {
    name: 'DATABASE_URL',
    summary: 's',
    local: 'postgres://app:app@127.0.0.1:5432/app',
    compose: 'postgres://app:app@database:5432/app',
    test: 'postgres://app:app@127.0.0.1:5432/app_test',
    e2e: 'postgres://app:app@127.0.0.1:5432/app_e2e',
    e2eOverride: 'E2E_DATABASE_URL',
  }
  const provider = {
    schemaVersion: 1,
    kind: 'database',
    id: 'postgres',
    name: 'P',
    service: 'database',
    compose: 'compose.yaml',
    env: [entry],
  }

  test('the schema takes e2e and e2eOverride, and checks their shape', () => {
    expect(validateAgainst('provider', provider)).toEqual([])
    const bad = { ...provider, env: [{ ...entry, e2eOverride: 'lower' }] }
    expect(validateAgainst('provider', bad)).not.toEqual([])
    const quote = { ...provider, env: [{ ...entry, e2e: 'a"b' }] }
    expect(validateAgainst('provider', quote)).not.toEqual([])
  })

  test('the example env file names the e2e database and its override', () => {
    const out = tempDir()
    generate(catalog, resolveRequest(catalog, request(out, { capabilities: ['database=fake'] })))
    expect(read(out, 'backend', '.env.example')).toContain(
      '# Browser tests (e2eDb) use fake://localhost:5432/app_e2e; override with E2E_DATABASE_URL.',
    )
  })
})

describe('route-group paths (parentheses) in onlyWhen and onlyPaths', () => {
  const frontend = (onlyWhen: unknown) => ({
    ...manifestOf('frontend'),
    onlyWhen: { 'server:auth': onlyWhen },
  })
  function manifestOf(kind: string) {
    return {
      schemaVersion: 1,
      id: 'x',
      kind,
      name: 'X',
      version: '1.0.0',
      summary: 's',
      runtime: { language: 'typescript', platform: 'bun' },
      tools: [{ name: 'bun' }],
      placeholders: [],
      commands: { check: 'bun run check' },
      agents: 'AGENTS.md',
    }
  }

  test('the schema accepts a route group and refuses escapes', () => {
    for (const ok of ['src/app/(auth)', 'src/app/(site)/(staff)/page.tsx', 'src/app/(auth)/id']) {
      expect(validateAgainst('template', frontend([ok]))).toEqual([])
    }
    for (const bad of [
      '(..)',
      'src/(..)/x',
      '../x',
      'a/../b',
      '/abs',
      'a\\b',
      'a//b',
      '',
      'C:/x',
    ]) {
      expect(validateAgainst('template', frontend([bad]))).not.toEqual([])
    }
  })

  test('flag onlyPaths take parentheses too', () => {
    const flags = { f: { summary: 's', default: true, onlyPaths: ['src/app/(auth)'] } }
    expect(validateAgainst('template', { ...manifestOf('server'), flags })).toEqual([])
    const bad = { f: { summary: 's', default: true, onlyPaths: ['src/(..)'] } }
    expect(validateAgainst('template', { ...manifestOf('server'), flags: bad })).not.toEqual([])
  })

  test('the overlay schema takes parentheses and refuses (..)', () => {
    const overlay = (path: string) => ({
      schemaVersion: 1,
      kind: 'database',
      provider: 'postgres',
      summary: 's',
      flags: { auth: { onlyPaths: [path] } },
    })
    expect(validateAgainst('capability', overlay('src/(auth)'))).toEqual([])
    expect(validateAgainst('capability', overlay('src/(..)'))).not.toEqual([])
  })

  test('the generator removes, or keeps, a folder whose name has parentheses', () => {
    const root = copyFixture('catalog')
    const dir = path.join(root, 'frontend', 'mini-ui', 'base', 'src', 'app', '(auth)')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'login.ts'), 'export const login = true\n')
    const ui = path.join(root, 'frontend', 'mini-ui', 'template.yaml')
    writeFileSync(
      ui,
      readFileSync(ui, 'utf8').replace('[src/session.ts]', '[src/session.ts, src/app/(auth)]'),
    )
    const loaded = loadCatalog(root)
    const on = tempDir()
    generate(loaded, resolveRequest(loaded, request(on)))
    expect(existsSync(path.join(on, 'frontend', 'src', 'app', '(auth)', 'login.ts'))).toBe(true)
    const off = tempDir()
    generate(loaded, resolveRequest(loaded, request(off, { flags: ['auth=false'] })))
    expect(existsSync(path.join(off, 'frontend', 'src', 'app', '(auth)'))).toBe(false)
    // The emptied parent goes too, as for any onlyPath.
    expect(existsSync(path.join(off, 'frontend', 'src', 'app'))).toBe(false)
  })
})

describe('generated code and ignored brand options', () => {
  const withFile = (relative: string) => {
    const root = copyFixture('catalog')
    const file = path.join(root, 'frontend', 'mini-ui', 'base', relative)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, '// @ts-ignore\nexport const generated = 1\n')
    return loadCatalog(root)
  }
  const serverOnly = { stack: undefined, template: 'server/mini' }

  test('the marker scan skips the generated client directory', () => {
    const loaded = withFile('src/shared/api/generated/sdk.gen.ts')
    const out = tempDir()
    generate(loaded, resolveRequest(loaded, request(out)))
    expect(read(out, 'frontend', 'src', 'shared', 'api', 'generated', 'sdk.gen.ts')).toContain(
      '@ts-ignore',
    )
    expect(dryRunMarkers(loaded.templates.get('frontend/mini-ui')!, ['auth'])).toEqual([])
  })

  test.each([
    'src/api/generated/sdk.gen.ts',
    'src/shared/generated/sdk.gen.ts',
    'generated/sdk.gen.ts',
  ])('a generated/ directory elsewhere (%s) is still scanned', (relative) => {
    const loaded = withFile(relative)
    expect(() => generate(loaded, resolveRequest(loaded, request(tempDir())))).toThrow(
      /unknown marker name "ts-ignore"/,
    )
    expect(dryRunMarkers(loaded.templates.get('frontend/mini-ui')!, ['auth']).join()).toContain(
      'ts-ignore',
    )
  })

  test('the same line outside generated/ is still an unknown marker', () => {
    const loaded = withFile('src/api/hand-written.ts')
    expect(() => generate(loaded, resolveRequest(loaded, request(tempDir())))).toThrow(
      /unknown marker name "ts-ignore"/,
    )
    expect(dryRunMarkers(loaded.templates.get('frontend/mini-ui')!, ['auth']).join()).toContain(
      'ts-ignore',
    )
  })

  test('a server-only plan lists the brand options it ignores, and warns when generating', () => {
    const brand = { primary: '#00aa00', density: 'compact' }
    const plan = resolveRequest(catalog, { ...request(tempDir(), serverOnly), brand })
    expect(plan.ignoredBrand).toEqual(['primary', 'density'])
    const lines: string[] = []
    generate(catalog, plan, { log: (line) => lines.push(line) })
    expect(lines.some((line) => /warning.*brand.*primary, density/.test(line))).toBe(true)
  })

  test('a plan with a frontend ignores nothing, and no option means no warning', () => {
    const withBrand = resolveRequest(catalog, {
      ...request(tempDir()),
      brand: { primary: '#00aa00' },
    })
    expect(withBrand.ignoredBrand).toEqual([])
    const plain = resolveRequest(catalog, request(tempDir(), serverOnly))
    expect(plain.ignoredBrand).toEqual([])
  })
})
