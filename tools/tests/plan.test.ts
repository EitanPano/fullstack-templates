import { describe, expect, test } from 'bun:test'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadCatalog } from '../lib/catalog'
import { PlanError, resolveRequest, selectionsFor } from '../lib/plan'
import { copyFixture, FIXTURE } from './helpers'

const catalog = loadCatalog(FIXTURE)
const base = {
  out: 'C:/tmp/x',
  name: 'Demo App',
  flags: [],
  capabilities: [],
  skipPostGenerate: true,
}

const STACK_FRONT_FIRST = [
  'schemaVersion: 1',
  'id: mini',
  'summary: Mini server and UI',
  'packages:',
  '  - template: frontend/mini-ui',
  '    dir: frontend',
  '  - template: server/mini',
  '    dir: backend',
  '',
].join('\n')
const EXTRA_SERVER = '\n  - template: server/mini\n    dir: api\n'

describe('resolveRequest', () => {
  test('resolves a stack with defaults, server wiring and contract order', () => {
    const plan = resolveRequest(catalog, { ...base, stack: 'mini' })
    expect(plan.projectName).toBe('demo-app')
    expect(plan.packages.map((p) => p.dir)).toEqual(['backend', 'frontend'])
    expect(plan.packages[0]?.flags).toEqual({ auth: true })
    expect(plan.packages[0]?.selections).toEqual({
      auth: true,
      database: false,
      'database:fake': false,
      server: true,
      single: false,
    })
    expect(plan.packages[1]?.serverDir).toBe('backend')
    expect(plan.packages[1]?.serverPort).toBe(4000)
    expect(plan.packages[1]?.contractSkipped).toBe(false)
  })
  test('routes a flag shorthand to the one package that declares it', () => {
    const plan = resolveRequest(catalog, { ...base, stack: 'mini', flags: ['auth=false'] })
    expect(plan.packages[0]?.flags).toEqual({ auth: false })
    expect(plan.packages[0]?.selections).toEqual({
      auth: false,
      database: false,
      'database:fake': false,
      server: true,
      single: false,
    })
  })
  test('rejects an ambiguous shorthand naming both packages', () => {
    const copy = copyFixture('catalog')
    const file = path.join(copy, 'frontend', 'mini-ui', 'template.yaml')
    const yaml = readFileSync(file, 'utf8').replace(
      'gitignore:',
      'flags:\n  auth:\n    summary: Auth\n    default: true\ngitignore:',
    )
    writeFileSync(file, yaml)
    const cases = path.join(copy, 'frontend', 'mini-ui', 'tests', 'cases.yaml')
    appendFileSync(cases, '  - name: own-auth-off\n    flags: { auth: false }\n')
    const ambiguous = loadCatalog(copy)
    let message = ''
    try {
      resolveRequest(ambiguous, { ...base, stack: 'mini', flags: ['auth=false'] })
    } catch (error) {
      expect(error).toBeInstanceOf(PlanError)
      message = (error as Error).message
    }
    expect(message).toContain('backend')
    expect(message).toContain('frontend')
  })
  test('takes package-qualified answers', () => {
    const plan = resolveRequest(catalog, {
      ...base,
      stack: 'mini',
      answers: { projectName: 'other', packages: { backend: { flags: { auth: false } } } },
    })
    expect(plan.projectName).toBe('other')
    expect(plan.packages[0]?.flags.auth).toBe(false)
  })
  test('rejects an unknown flag and an answers key that is not a package dir', () => {
    expect(() =>
      resolveRequest(catalog, { ...base, stack: 'mini', flags: ['oauth=true'] }),
    ).toThrow(PlanError)
    expect(() =>
      resolveRequest(catalog, { ...base, stack: 'mini', answers: { packages: { api: {} } } }),
    ).toThrow('api')
  })
  test('routes a capability shorthand to the package that declares it', () => {
    const plan = resolveRequest(catalog, {
      ...base,
      stack: 'mini',
      capabilities: ['database=fake'],
    })
    const backend = plan.packages[0]
    expect(backend?.dir).toBe('backend')
    expect(backend?.capabilities).toEqual({ database: 'fake' })
    expect(backend?.overlays.map((o) => `${o.kind}/${o.provider}`)).toEqual(['database/fake'])
    expect(backend?.commands.testDb).toBe('bun run test:db')
    expect(backend?.commands.migrate).toBe('bun run db:migrate')
    expect(backend?.commands.check).toBe('bun ./ok.ts')
    expect(backend?.selections).toEqual({
      auth: true,
      server: true,
      single: false,
      database: true,
      'database:fake': true,
    })
    expect(plan.providers.map((p) => `${p.kind}/${p.id}`)).toEqual(['database/fake'])
    expect(plan.packages[1]?.capabilities).toEqual({})
  })
  test('takes capabilities from answers and lets a shorthand override them', () => {
    const answers = { packages: { backend: { capabilities: { database: 'fake' } } } }
    const plan = resolveRequest(catalog, { ...base, stack: 'mini', answers })
    expect(plan.packages[0]?.capabilities).toEqual({ database: 'fake' })
    expect(plan.packages[0]?.selections['database:fake']).toBe(true)
    const copy = loadCatalog(FIXTURE)
    const listed = copy.templates.get('server/mini')
    if (listed?.manifest.capabilities?.database === undefined) throw new Error('no capability')
    listed.manifest.capabilities.database.providers = ['fake', 'other']
    const fake = listed.overlays.get('database/fake')
    const fakeProvider = copy.providers.get('database/fake')
    if (fake === undefined || fakeProvider === undefined) throw new Error('no fake')
    listed.overlays.set('database/other', { ...fake, provider: 'other' })
    copy.providers.set('database/other', { ...fakeProvider, id: 'other' })
    const overridden = resolveRequest(copy, {
      ...base,
      stack: 'mini',
      answers,
      capabilities: ['database=other'],
    })
    expect(overridden.packages[0]?.capabilities).toEqual({ database: 'other' })
    expect(overridden.packages[0]?.selections['database:fake']).toBe(false)
    expect(overridden.providers.map((p) => p.id)).toEqual(['other'])
  })
  test('keeps the last value of a repeated capability shorthand', () => {
    const plan = resolveRequest(catalog, {
      ...base,
      stack: 'mini',
      capabilities: ['database=fake', 'database=fake'],
    })
    expect(plan.packages[0]?.capabilities).toEqual({ database: 'fake' })
  })
  test('selects no capability by default', () => {
    const plan = resolveRequest(catalog, { ...base, stack: 'mini' })
    expect(plan.packages[0]?.capabilities).toEqual({})
    expect(plan.packages[0]?.overlays).toEqual([])
    expect(plan.packages[0]?.commands.testDb).toBeUndefined()
    expect(plan.packages[0]?.selections).toEqual({
      auth: true,
      server: true,
      single: false,
      database: false,
      'database:fake': false,
    })
    expect(plan.providers).toEqual([])
  })
  test('rejects an unknown capability kind', () => {
    expect(() =>
      resolveRequest(catalog, { ...base, stack: 'mini', capabilities: ['cache=redis'] }),
    ).toThrow('unknown capability: cache')
  })
  test('rejects a capability declared by two packages and names both', () => {
    const copy = loadCatalog(FIXTURE)
    const front = copy.templates.get('frontend/mini-ui')
    if (front === undefined) throw new Error('no frontend')
    front.manifest.capabilities = { database: { providers: ['fake'] } }
    let message = ''
    try {
      resolveRequest(copy, { ...base, stack: 'mini', capabilities: ['database=fake'] })
    } catch (error) {
      expect(error).toBeInstanceOf(PlanError)
      message = (error as Error).message
    }
    expect(message).toContain('capability database is ambiguous')
    expect(message).toContain('backend and frontend')
    expect(message).toContain('answers file')
  })
  test('rejects a provider the package does not list, naming the package and the list', () => {
    expect(() =>
      resolveRequest(catalog, { ...base, stack: 'mini', capabilities: ['database=postgres'] }),
    ).toThrow('backend has no provider "postgres" for capability database: it lists fake')
    const copy = loadCatalog(FIXTURE)
    const server = copy.templates.get('server/mini')
    if (server?.manifest.capabilities?.database === undefined) throw new Error('no capability')
    server.manifest.capabilities.database.providers = []
    expect(() =>
      resolveRequest(copy, { ...base, stack: 'mini', capabilities: ['database=fake'] }),
    ).toThrow('it lists none')
  })
  test('rejects answers naming an undeclared kind or an unlisted provider', () => {
    const answer = (capabilities: Record<string, string>) => ({
      packages: { backend: { capabilities } },
    })
    expect(() =>
      resolveRequest(catalog, { ...base, stack: 'mini', answers: answer({ cache: 'redis' }) }),
    ).toThrow('unknown capability for backend: cache')
    expect(() =>
      resolveRequest(catalog, { ...base, stack: 'mini', answers: answer({ database: 'nope' }) }),
    ).toThrow('backend has no provider "nope" for capability database')
    expect(() =>
      resolveRequest(catalog, {
        ...base,
        stack: 'mini',
        answers: { packages: { frontend: { capabilities: { database: 'fake' } } } },
      }),
    ).toThrow('unknown capability for frontend: database')
  })
  test('generates a lone server into backend/ and a lone frontend with the contract skipped', () => {
    const server = resolveRequest(catalog, { ...base, template: 'server/mini' })
    expect(server.packages.map((p) => p.dir)).toEqual(['backend'])
    const front = resolveRequest(catalog, { ...base, template: 'frontend/mini-ui' })
    expect(front.packages[0]?.contractSkipped).toBe(true)
    expect(front.packages[0]?.serverDir).toBeNull()
  })
  test('requires exactly one of stack and template', () => {
    expect(() => resolveRequest(catalog, { ...base })).toThrow(PlanError)
    expect(() =>
      resolveRequest(catalog, { ...base, stack: 'mini', template: 'server/mini' }),
    ).toThrow(PlanError)
  })

  test('orders a consumer after its server whatever the stack lists first', () => {
    const copy = copyFixture('catalog')
    writeFileSync(path.join(copy, 'stacks', 'mini', 'stack.yaml'), STACK_FRONT_FIRST)
    const plan = resolveRequest(loadCatalog(copy), { ...base, stack: 'mini' })
    expect(plan.packages.map((p) => p.dir)).toEqual(['backend', 'frontend'])
  })
  test('rejects a stack with two servers', () => {
    const copy = copyFixture('catalog')
    const file = path.join(copy, 'stacks', 'mini', 'stack.yaml')
    writeFileSync(file, readFileSync(file, 'utf8').trimEnd() + EXTRA_SERVER)
    expect(() => resolveRequest(loadCatalog(copy), { ...base, stack: 'mini' })).toThrow(
      'backend and api',
    )
  })
  test('refuses a package dir equal to a selected provider service name', () => {
    expect(() =>
      resolveRequest(catalog, {
        ...base,
        template: 'server/mini',
        dir: 'database',
        capabilities: ['database=fake'],
      }),
    ).toThrow(/package dir "database".*database\/fake/)
    expect(
      resolveRequest(catalog, { ...base, template: 'server/mini', dir: 'database' }).packages,
    ).toHaveLength(1)
  })
  test('rejects malformed shorthand entries', () => {
    expect(() => resolveRequest(catalog, { ...base, stack: 'mini', flags: ['auth'] })).toThrow(
      'auth',
    )
    expect(() =>
      resolveRequest(catalog, { ...base, stack: 'mini', flags: ['auth=maybe'] }),
    ).toThrow('maybe')
    expect(() =>
      resolveRequest(catalog, { ...base, stack: 'mini', capabilities: ['database'] }),
    ).toThrow('database')
  })
  test('refuses --dir with a stack and an unsafe --dir', () => {
    expect(() => resolveRequest(catalog, { ...base, stack: 'mini', dir: 'x' })).toThrow(
      '--dir only applies',
    )
    expect(() =>
      resolveRequest(catalog, { ...base, template: 'server/mini', dir: '../x' }),
    ).toThrow(PlanError)
    expect(() =>
      resolveRequest(catalog, { ...base, template: 'server/mini', dir: '/abs' }),
    ).toThrow(PlanError)
    expect(
      resolveRequest(catalog, { ...base, template: 'server/mini', dir: 'api' }).packages[0]?.dir,
    ).toBe('api')
  })
})

describe('resolveRequest: derived migrate service and the server dev command', () => {
  const withMigrate = () => {
    const root = copyFixture('catalog')
    appendFileSync(
      path.join(root, 'server/mini/capabilities/database/fake/capability.yaml'),
      'container:\n  migrate: bun ./ok.ts\n',
    )
    return root
  }

  test('refuses a derived name that is a package dir', () => {
    const root = withMigrate()
    const stack = path.join(root, 'stacks/mini/stack.yaml')
    appendFileSync(stack, '  - template: frontend/mini-ui\n    dir: backend-migrate\n')
    const request = { ...base, stack: 'mini', capabilities: ['database=fake'] }
    expect(() => resolveRequest(loadCatalog(root), request)).toThrow(PlanError)
    expect(() => resolveRequest(loadCatalog(root), request)).toThrow(/backend-migrate/)
  })

  test('refuses a derived name that is a provider service', () => {
    const root = withMigrate()
    const file = path.join(root, 'shared/providers/database/fake/provider.yaml')
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace('service: database', 'service: backend-migrate'),
    )
    const compose = path.join(root, 'shared/providers/database/fake/compose.yaml')
    writeFileSync(compose, readFileSync(compose, 'utf8').replace('database:', 'backend-migrate:'))
    expect(() =>
      resolveRequest(loadCatalog(root), {
        ...base,
        stack: 'mini',
        capabilities: ['database=fake'],
      }),
    ).toThrow(/backend-migrate.*Compose service/)
  })

  test('takes the server dev command from the plan, and bun run dev when there is no server', () => {
    const root = copyFixture('catalog')
    const file = path.join(root, 'server/mini/template.yaml')
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace('commands:\n', 'commands:\n  dev: bun run serve\n'),
    )
    const stackPlan = resolveRequest(loadCatalog(root), { ...base, stack: 'mini' })
    expect(stackPlan.packages[1]?.serverDevCommand).toBe('bun run serve')
    const alone = resolveRequest(loadCatalog(root), {
      ...base,
      template: 'frontend/mini-ui',
    })
    expect(alone.packages[0]?.serverDevCommand).toBeNull()
  })
})

describe('resolveRequest: deploy mode', () => {
  const spa = { ...base, stack: 'mini-spa' }
  const single = (plan: ReturnType<typeof resolveRequest>) =>
    plan.packages.map((pkg) => pkg.selections.single)

  test('defaults to single when the plan has a server and the frontend declares static', () => {
    const plan = resolveRequest(catalog, spa)
    expect(plan.deploy).toBe('single')
    expect(single(plan)).toEqual([true, true])
    expect(plan.packages.map((pkg) => pkg.frontendDir)).toEqual(['frontend', 'frontend'])
  })
  test('defaults to split when the frontend has no static', () => {
    const plan = resolveRequest(catalog, { ...base, stack: 'mini' })
    expect(plan.deploy).toBe('split')
    expect(single(plan)).toEqual([false, false])
  })
  test('--deploy split on a static frontend and a server gives split', () => {
    const plan = resolveRequest(catalog, { ...spa, deploy: 'split' })
    expect(plan.deploy).toBe('split')
    expect(single(plan)).toEqual([false, false])
  })
  test('takes deploy from the answers, and the request overrides them', () => {
    const fromAnswers = resolveRequest(catalog, { ...spa, answers: { deploy: 'split' } })
    expect(fromAnswers.deploy).toBe('split')
    const overridden = resolveRequest(catalog, {
      ...spa,
      answers: { deploy: 'split' },
      deploy: 'single',
    })
    expect(overridden.deploy).toBe('single')
  })
  test('a lone package has no mode, and single is never true without a server', () => {
    for (const template of ['server/mini', 'frontend/mini-ui', 'frontend/mini-spa']) {
      const plan = resolveRequest(catalog, { ...base, template })
      expect(plan.deploy).toBeNull()
      expect(single(plan)).toEqual([false])
    }
  })
  test('refuses single when the frontend declares no static, naming the template', () => {
    const request = { ...base, stack: 'mini', deploy: 'single' }
    expect(() => resolveRequest(catalog, request)).toThrow(PlanError)
    expect(() => resolveRequest(catalog, request)).toThrow(/frontend\/mini-ui.*static/)
  })
  test('refuses single with no server in the plan', () => {
    const request = { ...base, template: 'frontend/mini-spa', deploy: 'single' }
    expect(() => resolveRequest(catalog, request)).toThrow(/needs a server package/)
  })
  test('refuses single with no frontend in the plan', () => {
    const request = { ...base, template: 'server/mini', deploy: 'single' }
    expect(() => resolveRequest(catalog, request)).toThrow(/needs a frontend package/)
  })
  test('accepts split on a lone package as a no-op: it is true of any one package', () => {
    for (const template of ['server/mini', 'frontend/mini-ui']) {
      const plan = resolveRequest(catalog, { ...base, template, deploy: 'split' })
      expect(plan.deploy).toBeNull()
    }
  })
  test('refuses an unknown value from the request and from the answers', () => {
    expect(() => resolveRequest(catalog, { ...spa, deploy: 'both' })).toThrow(
      'unknown deploy mode "both": expected single or split',
    )
    expect(() => resolveRequest(catalog, { ...spa, answers: { deploy: 'x' } })).toThrow(
      'unknown deploy mode "x"',
    )
  })
})

describe('selectionsFor: the reserved single', () => {
  const template = catalog.templates.get('server/mini') as NonNullable<
    ReturnType<typeof catalog.templates.get>
  >
  test('is true only when asked and a server is present', () => {
    expect(selectionsFor(template, {}, true, true, {}).single).toBe(true)
    expect(selectionsFor(template, {}, true, false, {}).single).toBe(false)
    expect(selectionsFor(template, {}, false, true, {}).single).toBe(false)
  })
})

describe('cross-package selections', () => {
  const frontend = (stackOrTemplate: object, extra: object = {}) =>
    resolveRequest(catalog, { ...base, ...stackOrTemplate, ...extra })

  test('a frontend sees the server flags and capability kinds as server:<name>', () => {
    const plan = frontend({ stack: 'mini' })
    expect(plan.packages[1]?.selections).toEqual({
      server: true,
      single: false,
      'server:auth': true,
      'server:database': false,
    })
  })

  test('follows the server package answers', () => {
    const plan = frontend(
      { stack: 'mini' },
      {
        answers: {
          packages: { backend: { flags: { auth: false }, capabilities: { database: 'fake' } } },
        },
      },
    )
    expect(plan.packages[1]?.selections).toMatchObject({
      'server:auth': false,
      'server:database': true,
    })
    // The server itself has no server: names.
    expect(
      Object.keys(plan.packages[0]?.selections ?? {}).some((n) => n.startsWith('server:')),
    ).toBe(false)
  })

  test('a flag shorthand reaches the frontend through the server', () => {
    const plan = frontend({ stack: 'mini', flags: ['auth=false'] })
    expect(plan.packages[1]?.selections['server:auth']).toBe(false)
  })

  test('an alone frontend has every server:* selection off, and still knows the names', () => {
    const plan = frontend({ template: 'frontend/mini-ui' })
    expect(plan.packages[0]?.selections).toEqual({
      server: false,
      single: false,
      'server:auth': false,
      'server:database': false,
    })
  })

  test('selectionsFor adds the server facts under the server: prefix', () => {
    const template = catalog.templates.get('frontend/mini-ui')!
    expect(selectionsFor(template, {}, true, false, {}, { auth: true, database: false })).toEqual({
      server: true,
      single: false,
      'server:auth': true,
      'server:database': false,
    })
  })
})

describe('brand in the plan', () => {
  test('a plan with a frontend carries the resolved brand and its placeholders', () => {
    const plan = resolveRequest(catalog, { ...base, stack: 'mini' })
    expect(plan.brand?.inputs).toEqual({
      displayName: 'Demo App',
      primary: '#1d4ed8',
      neutral: '#64748b',
      radius: 'md',
      font: 'system',
      theme: 'system',
      density: 'comfortable',
    })
    expect(plan.brand?.placeholders.THEME_LIGHT).toContain('--background: oklch(1 0 0);')
  })
  test('a server-only plan has no brand', () => {
    expect(resolveRequest(catalog, { ...base, template: 'server/mini' }).brand).toBeNull()
  })
  test('takes the brand from the request and from answers.brand, the request winning', () => {
    const answers = { brand: { primary: '#ff0000', radius: 'sm', displayName: 'From File' } }
    const plan = resolveRequest(catalog, {
      ...base,
      stack: 'mini',
      answers,
      brand: { primary: '#00aa00', density: 'compact' },
    })
    expect(plan.brand?.inputs).toMatchObject({
      primary: '#00aa00',
      radius: 'sm',
      displayName: 'From File',
      density: 'compact',
    })
  })
  test('refuses a bad value and an unknown answers.brand key as a PlanError', () => {
    expect(() =>
      resolveRequest(catalog, { ...base, stack: 'mini', brand: { radius: 'xl' } }),
    ).toThrow(PlanError)
    expect(() =>
      resolveRequest(catalog, {
        ...base,
        stack: 'mini',
        answers: { brand: { colour: 'red' } } as never,
      }),
    ).toThrow('colour')
  })
  test('a seed that cannot pass fails the plan naming the pair', () => {
    // A malformed seed stands in; the contrast failure naming a pair is covered in theme.test.ts.
    expect(() =>
      resolveRequest(catalog, { ...base, stack: 'mini', brand: { primary: 'nope' } }),
    ).toThrow(/brand-primary/)
  })
})

describe('plan edge cases of the foundation', () => {
  test('a server-only plan does not resolve the brand, so a long project name is fine', () => {
    const name = 'a-project-name-' + 'long-'.repeat(20) + 'end'
    const plan = resolveRequest(catalog, { ...base, name, template: 'server/mini' })
    expect(plan.brand).toBeNull()
  })
  test('a long project name gets a truncated default display name with a frontend', () => {
    const name = 'a-project-name-' + 'long-'.repeat(20) + 'end'
    const plan = resolveRequest(catalog, { ...base, name, stack: 'mini' })
    expect(plan.brand?.inputs.displayName.length).toBeLessThanOrEqual(60)
  })
  test('a frontend without contract.consumes still sees the server selections', () => {
    const copy = copyFixture('catalog')
    const ui = path.join(copy, 'frontend', 'mini-ui', 'template.yaml')
    writeFileSync(
      ui,
      readFileSync(ui, 'utf8').replace("contract:\n  consumes: '<server>/openapi.json'\n", ''),
    )
    writeFileSync(path.join(copy, 'stacks', 'mini', 'stack.yaml'), STACK_FRONT_FIRST)
    const plan = resolveRequest(loadCatalog(copy), {
      ...base,
      stack: 'mini',
      flags: ['auth=false'],
    })
    // The frontend is declared, and so planned, before the server here.
    expect(plan.packages.map((p) => p.dir)).toEqual(['frontend', 'backend'])
    expect(plan.packages[0]?.selections['server:auth']).toBe(false)
    const on = resolveRequest(loadCatalog(copy), { ...base, stack: 'mini' })
    expect(on.packages[0]?.selections['server:auth']).toBe(true)
  })
})
