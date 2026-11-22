// ADR 0015 F1 and F2: several frontends in a plan, each at a requested directory.
// The fixtures are serverless/mini-fn, frontend/mini-site (islands flag, port 4321, no image),
// frontend/mini-ui, stacks/mini-site-fn and stacks/mini.
import { describe, expect, test } from 'bun:test'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { loadCatalog } from '../lib/catalog'
import { listCases, requestFor } from '../lib/cases'
import { dryRunMarkers } from '../lib/dry-run'
import { generate, packagePlaceholders } from '../lib/generate'
import {
  PlanError,
  parseFrontendArg,
  resolveRequest,
  selectionsFor,
  type RequestInput,
} from '../lib/plan'
import { runCase, type Options } from '../lib/run-case'
import { validateAgainst } from '../lib/schema'
import { FIXTURE, copyFixture, tempDir } from './helpers'

const catalog = loadCatalog(FIXTURE)
const base = { name: 'Demo', flags: [], capabilities: [], skipPostGenerate: true }
const SITE = 'frontend/mini-site'
const FN = 'serverless/mini-fn'
const pair = (dir: string, template = SITE) => ({ dir, template })
const two = [pair('site'), pair('admin')]
const request = (extra: Partial<RequestInput> = {}): RequestInput => ({
  ...base,
  out: tempDir(),
  stack: 'mini-site-fn',
  frontends: two,
  ...extra,
})
const pkgOf = (plan: ReturnType<typeof resolveRequest>, dir: string) => {
  const found = plan.packages.find((p) => p.dir === dir)
  if (!found) throw new Error(`no package ${dir}`)
  return found
}
const read = (out: string, file: string) => readFileSync(path.join(out, file), 'utf8')

describe('parseFrontendArg', () => {
  test('reads dir=template', () => {
    expect(parseFrontendArg('site=frontend/astro')).toEqual({
      dir: 'site',
      template: 'frontend/astro',
    })
  })
  test.each(['site', '=frontend/astro', 'site=', ''])('refuses the malformed pair "%s"', (text) => {
    expect(() => parseFrontendArg(text)).toThrow(PlanError)
  })
})

describe('the request', () => {
  test('refuses an unknown template, a template of another kind, a bad dir and a repeated dir', () => {
    const lone = (frontends: RequestInput['frontends']) => request({ stack: undefined, frontends })
    expect(() => resolveRequest(catalog, lone([pair('site', 'frontend/nope')]))).toThrow(
      /unknown template: frontend\/nope/,
    )
    expect(() => resolveRequest(catalog, lone([pair('site', 'server/mini')]))).toThrow(
      /server\/mini is not a frontend template/,
    )
    expect(() => resolveRequest(catalog, lone([pair('Bad_Dir')]))).toThrow(
      /invalid package dir: Bad_Dir/,
    )
    expect(() =>
      resolveRequest(catalog, request({ frontends: [pair('site'), pair('site')] })),
    ).toThrow(/frontend dir "site" is listed twice/)
  })
  test('with a stack the frontends take the place of the stack frontend, in order', () => {
    const plan = resolveRequest(catalog, request())
    expect(plan.packages.map((p) => p.dir)).toEqual([FN, 'site', 'admin'])
    expect(plan.frontends.map((p) => p.dir)).toEqual(['site', 'admin'])
    expect(plan.stackId).toBe('mini-site-fn')
    const reversed = resolveRequest(catalog, request({ frontends: [...two].reverse() }))
    expect(reversed.frontends.map((p) => p.dir)).toEqual(['admin', 'site'])
  })
  test('the frontends sit where the stack frontend was, around the other members', () => {
    const root = copyFixture('catalog')
    const file = path.join(root, 'stacks/mini-site-fn/stack.yaml')
    writeFileSync(
      file,
      [
        'schemaVersion: 1',
        'id: mini-site-fn',
        'summary: Mini site and functions',
        'packages:',
        '  - template: frontend/mini-site',
        '    dir: frontend',
        '  - template: serverless/mini-fn',
        '    dir: serverless/mini-fn',
        '',
      ].join('\n'),
    )
    const plan = resolveRequest(loadCatalog(root), request())
    // The consumers still follow the API they consume, in their stack order.
    expect(plan.packages.map((p) => p.dir)).toEqual([FN, 'site', 'admin'])
  })
  test('a stack without a frontend refuses --frontend', () => {
    const loaded = loadCatalog(FIXTURE)
    const stack = loaded.stacks.get('mini-site-fn')!
    stack.manifest.packages = [{ template: FN, dir: FN }]
    expect(() => resolveRequest(loaded, request())).toThrow(
      /stack mini-site-fn has no frontend member/,
    )
  })
  test("each frontend must use the stack's own frontend template", () => {
    expect(() =>
      resolveRequest(
        catalog,
        request({ frontends: [pair('site'), pair('app', 'frontend/mini-ui')] }),
      ),
    ).toThrow(/stack mini-site-fn.*frontend\/mini-site.*frontend\/mini-ui/)
  })
  test('without --frontend a stack keeps its frontend at its own dir', () => {
    const plan = resolveRequest(catalog, request({ frontends: undefined }))
    expect(plan.packages.map((p) => p.dir)).toEqual([FN, 'frontend'])
    expect(plan.frontends.map((p) => p.dir)).toEqual(['frontend'])
    expect(resolveRequest(catalog, request({ frontends: [] })).frontends.map((p) => p.dir)).toEqual(
      ['frontend'],
    )
  })
  test('--frontend is refused beside --template', () => {
    expect(() =>
      resolveRequest(
        catalog,
        request({ stack: undefined, template: SITE, frontends: [pair('site')] }),
      ),
    ).toThrow(/--frontend replaces --template/)
  })
  test('a lone --frontend is the plan --template <template> --dir <dir> gives', () => {
    const lone = resolveRequest(catalog, request({ stack: undefined, frontends: [pair('site')] }))
    const same = resolveRequest(catalog, {
      ...base,
      out: lone.out,
      template: SITE,
      dir: 'site',
    })
    expect(lone.packages.map((p) => [p.dir, p.flags, p.selections, p.port])).toEqual(
      same.packages.map((p) => [p.dir, p.flags, p.selections, p.port]),
    )
    expect(lone.frontends.map((p) => p.dir)).toEqual(['site'])
    expect(lone.stackId).toBeNull()
  })
  test('several frontends with no stack are refused', () => {
    expect(() => resolveRequest(catalog, request({ stack: undefined }))).toThrow(
      /several frontends \(site, admin\) need an API package/,
    )
  })
  test('a lone --frontend refuses --dir, and neither stack nor template nor frontend still fails', () => {
    expect(() =>
      resolveRequest(catalog, request({ stack: undefined, frontends: [pair('site')], dir: 'x' })),
    ).toThrow(PlanError)
    expect(() =>
      resolveRequest(catalog, request({ stack: undefined, frontends: undefined })),
    ).toThrow(/give exactly one of a stack, a template and a lone --frontend/)
  })
  test('a stack and a template together are still refused', () => {
    expect(() =>
      resolveRequest(catalog, request({ template: SITE, frontends: undefined })),
    ).toThrow(PlanError)
  })
  test('two packages never share a directory, in a stack or a request', () => {
    expect(() =>
      resolveRequest(catalog, request({ frontends: [pair(FN), pair('admin')] })),
    ).toThrow(/package dir "serverless\/mini-fn" is used by both/)
    expect(() =>
      resolveRequest(
        catalog,
        request({ stack: 'mini', frontends: [pair('backend', 'frontend/mini-ui')] }),
      ),
    ).toThrow(/package dir "backend" is used by both server\/mini and frontend\/mini-ui/)
    expect(() => resolveRequest(catalog, request())).not.toThrow()
  })
  test('several frontends need an API package, with a stack or without', () => {
    const loaded = loadCatalog(FIXTURE)
    loaded.stacks.get('mini-site-fn')!.manifest.packages = [{ template: SITE, dir: 'frontend' }]
    expect(() => resolveRequest(loaded, request())).toThrow(
      /several frontends \(site, admin\) need an API package/,
    )
  })
  test('a second frontend beside a server package is refused, with the reason', () => {
    expect(() =>
      resolveRequest(
        catalog,
        request({
          stack: 'mini',
          frontends: [pair('site', 'frontend/mini-ui'), pair('admin', 'frontend/mini-ui')],
        }),
      ),
    ).toThrow(/several frontends.*single deploy mode.*serverless API/)
    const one = resolveRequest(
      catalog,
      request({ stack: 'mini', frontends: [pair('site', 'frontend/mini-ui')] }),
    )
    expect(one.packages.map((p) => p.dir)).toEqual(['backend', 'site'])
    expect(pkgOf(one, 'site').serverDir).toBe('backend')
  })
})

describe('the plan', () => {
  test('every frontend has the server wiring, and the first is the one __FRONTEND_DIR__ names', () => {
    const plan = resolveRequest(catalog, request())
    for (const dir of ['site', 'admin']) {
      const frontend = pkgOf(plan, dir)
      expect(frontend.serverDir).toBe(FN)
      expect(frontend.serverPort).toBe(8788)
      expect(frontend.selections).toMatchObject({ server: true, 'server:auth': true })
    }
    const values = packagePlaceholders(plan, pkgOf(plan, FN))
    expect(values.FRONTEND_DIR).toBe('site')
    expect(values.FRONTEND_PATH).toBe('../../site')
    expect(values.FRONTEND_OUT).toBe('dist')
    expect(packagePlaceholders(plan, pkgOf(plan, 'admin')).FRONTEND_DIR).toBe('site')
  })
  test('one brand serves every frontend', () => {
    const plan = resolveRequest(catalog, request())
    const a = packagePlaceholders(plan, pkgOf(plan, 'site'))
    const b = packagePlaceholders(plan, pkgOf(plan, 'admin'))
    expect(a.THEME_LIGHT).toBeDefined()
    expect(b.THEME_LIGHT).toBe(a.THEME_LIGHT)
    expect(b.PROJECT_DISPLAY_NAME).toBe(a.PROJECT_DISPLAY_NAME)
  })
  test('a plan whose API is serverless has no deploy mode with several frontends', () => {
    expect(resolveRequest(catalog, request()).deploy).toBeNull()
  })
  test('the frontends selection of the serverless package is on only for several', () => {
    const sel = (extra: Partial<RequestInput>) =>
      pkgOf(resolveRequest(catalog, request(extra)), FN).selections
    expect(sel({}).frontend).toBe(true)
    expect(sel({}).frontends).toBe(true)
    expect(sel({ frontends: [pair('site')] }).frontends).toBe(false)
    expect(sel({ frontends: undefined }).frontends).toBe(false)
    expect(sel({ stack: undefined, template: FN, frontends: undefined }).frontends).toBe(false)
    expect(sel({ stack: undefined, template: FN, frontends: undefined }).frontend).toBe(false)
  })
  test('the frontends selection of a frontend package is on only for several', () => {
    const sel = (extra: Partial<RequestInput>, dir = 'site') =>
      pkgOf(resolveRequest(catalog, request(extra)), dir).selections
    expect(sel({}).frontends).toBe(true)
    expect(sel({}, 'admin').frontends).toBe(true)
    expect(sel({ frontends: [pair('site')] }).frontends).toBe(false)
    expect(sel({ frontends: undefined }, 'frontend').frontends).toBe(false)
    const alone = resolveRequest(catalog, {
      ...base,
      out: tempDir(),
      template: SITE,
      dir: 'site',
    })
    expect(pkgOf(alone, 'site').selections.frontends).toBe(false)
  })
  test('selectionsFor gives a frontend template the frontends fact and no other template', () => {
    const site = catalog.templates.get(SITE)!
    expect(selectionsFor(site, {}, true, false, {}, {}, undefined, true).frontends).toBe(true)
    expect(selectionsFor(site, {}, true, false, {}).frontends).toBe(false)
    const server = catalog.templates.get('server/mini')!
    expect(
      selectionsFor(server, {}, false, false, {}, {}, undefined, true).frontends,
    ).toBeUndefined()
  })
  test('a marker on frontends reaches a frontend file and picks its variant', () => {
    const root = copyFixture('catalog')
    writeFileSync(
      path.join(root, 'frontend/mini-site/base/src/many.ts'),
      'export const several = true // @frontends\nexport const several = false // @nofrontends\n',
    )
    const withMarker = loadCatalog(root)
    expect(dryRunMarkers(withMarker.templates.get(SITE)!, ['auth'])).toEqual([])
    const read2 = (out: string, dir: string) => read(out, `${dir}/src/many.ts`)
    const many = tempDir()
    generate(withMarker, resolveRequest(withMarker, request({ out: many })))
    expect(read2(many, 'site')).toContain('several = true')
    expect(read2(many, 'admin')).toContain('several = true')
    const one = tempDir()
    generate(
      withMarker,
      resolveRequest(withMarker, request({ out: one, frontends: [pair('site')] })),
    )
    expect(read2(one, 'site')).toContain('several = false')
    const alone = tempDir()
    generate(
      withMarker,
      resolveRequest(withMarker, { ...base, out: alone, template: SITE, dir: 'site' }),
    )
    expect(read2(alone, 'site')).toContain('several = false')
  })
  test('several frontends must each be one name, a host label and a folder', () => {
    expect(() =>
      resolveRequest(catalog, request({ frontends: [pair('site'), pair('apps/admin')] })),
    ).toThrow(/each directory is one name: apps\/admin/)
    expect(
      resolveRequest(catalog, request({ frontends: [pair('apps/site')] })).frontends.map(
        (p) => p.dir,
      ),
    ).toEqual(['apps/site'])
  })
  test('selectionsFor takes the frontends fact after the frontend one', () => {
    const template = catalog.templates.get(FN)!
    expect(selectionsFor(template, {}, false, false, {}, {}, true, true).frontends).toBe(true)
    expect(selectionsFor(template, {}, false, false, {}, {}, true).frontends).toBe(false)
    expect(selectionsFor(template, {}, false, false, {}).frontends).toBeUndefined()
  })
  test('the dry run knows the frontends selection', () => {
    const root = copyFixture('catalog')
    writeFileSync(
      path.join(root, 'serverless/mini-fn/base/src/many.ts'),
      'a // @frontends\nb // @nofrontends\n',
    )
    const template = loadCatalog(root).templates.get(FN)!
    expect(dryRunMarkers(template)).toEqual([])
  })
  test('a flag named frontends is reserved', () => {
    const flags = { frontends: { summary: 's', default: true } }
    const manifest = {
      schemaVersion: 1,
      id: 'x',
      kind: 'serverless',
      name: 'X',
      version: '1.0.0',
      summary: 's',
      runtime: { language: 'typescript', platform: 'bun' },
      tools: [{ name: 'bun', min: '1.4' }],
      placeholders: ['PROJECT_NAME'],
      dependencies: { manifest: 'package.json', adapter: 'npm' },
      commands: { check: 'bun run check' },
      agents: 'AGENTS.md',
    }
    expect(validateAgainst('template', manifest)).toEqual([])
    expect(validateAgainst('template', { ...manifest, flags })).not.toEqual([])
  })
})

describe('ports', () => {
  test('a package keeps its template port unless an earlier package holds it', () => {
    const plan = resolveRequest(catalog, request({ frontends: [pair('a'), pair('b'), pair('c')] }))
    expect(plan.packages.map((p) => [p.dir, p.port])).toEqual([
      [FN, 8788],
      ['a', 4321],
      ['b', 4322],
      ['c', 4323],
    ])
    expect(packagePlaceholders(plan, pkgOf(plan, 'b')).PORT).toBe('4322')
    expect(packagePlaceholders(plan, pkgOf(plan, 'a')).PORT).toBe('4321')
  })
  test('the lowest free port above is taken, skipping one an earlier package holds', () => {
    const root = copyFixture('catalog')
    const file = path.join(root, 'serverless/mini-fn/template.yaml')
    writeFileSync(file, readFileSync(file, 'utf8').replace('port: 8788', 'port: 4322'))
    const plan = resolveRequest(
      loadCatalog(root),
      request({ frontends: [pair('a'), pair('b'), pair('c')] }),
    )
    // The API comes first and keeps 4322; the frontends step around it in request order.
    expect(plan.packages.map((p) => [p.dir, p.port])).toEqual([
      [FN, 4322],
      ['a', 4321],
      ['b', 4323],
      ['c', 4324],
    ])
  })
  test('serverPort is the API assigned port, and provenance records the assigned ones', () => {
    const out = tempDir()
    const plan = resolveRequest(catalog, request({ out }))
    expect(pkgOf(plan, 'admin').serverPort).toBe(8788)
    generate(catalog, plan)
    const record = parse(read(out, '.fullstack/catalog.yaml'))
    expect(record.packages.site.http.port).toBe(4321)
    expect(record.packages.admin.http.port).toBe(4322)
    expect(record.packages[FN].http.port).toBe(8788)
  })
  test('a plan with one frontend per template is unchanged', () => {
    const plan = resolveRequest(catalog, request({ frontends: undefined }))
    expect(plan.packages.map((p) => p.port)).toEqual([8788, 4321])
  })
})

describe('__FRONTENDS__', () => {
  test('is a compact JSON list in request order, safe in a single-quoted string', () => {
    const plan = resolveRequest(catalog, request())
    const raw = packagePlaceholders(plan, pkgOf(plan, FN)).FRONTENDS as string
    expect(raw).not.toMatch(/['\\\n ]/)
    expect(JSON.parse(raw)).toEqual([
      { dir: 'site', path: '../../site', out: 'dist', port: 4321 },
      { dir: 'admin', path: '../../admin', out: 'dist', port: 4322 },
    ])
  })
  test('is [] for a serverless plan without a frontend, and absent for other packages', () => {
    const alone = resolveRequest(catalog, {
      ...base,
      out: tempDir(),
      template: FN,
    })
    expect(packagePlaceholders(alone, pkgOf(alone, FN)).FRONTENDS).toBe('[]')
    const plan = resolveRequest(catalog, request())
    expect(Object.keys(packagePlaceholders(plan, pkgOf(plan, 'site')))).not.toContain('FRONTENDS')
  })
  test('one frontend gives a list of one', () => {
    const plan = resolveRequest(catalog, request({ frontends: undefined }))
    expect(JSON.parse(packagePlaceholders(plan, pkgOf(plan, FN)).FRONTENDS as string)).toEqual([
      { dir: 'frontend', path: '../../frontend', out: 'dist', port: 4321 },
    ])
  })
  test('the generator writes it, with the frontends marker on for several', () => {
    const out = tempDir()
    generate(catalog, resolveRequest(catalog, request({ out })))
    const text = read(out, `${FN}/src/frontends.ts`)
    expect(text).toContain(
      `JSON.parse('[{"dir":"site","path":"../../site","out":"dist","port":4321}`,
    )
    expect(text).toContain('several = true')
    expect(text).not.toContain('several = false')
    const one = tempDir()
    generate(catalog, resolveRequest(catalog, request({ out: one, frontends: undefined })))
    expect(read(one, `${FN}/src/frontends.ts`)).toContain('several = false')
    const none = tempDir()
    generate(catalog, resolveRequest(catalog, { ...base, out: none, template: FN }))
    expect(read(none, `${FN}/src/frontends.ts`)).toContain("JSON.parse('[]')")
  })
  test('the first frontend still feeds the FRONTEND_* lines', () => {
    const out = tempDir()
    generate(catalog, resolveRequest(catalog, request({ out })))
    expect(read(out, `${FN}/wrangler.jsonc`)).toContain('"directory": "../../site/dist"')
  })
})

describe('__FRONTEND_HOSTS__', () => {
  const hosts = (extra: Partial<RequestInput> = {}, dir = FN) => {
    const plan = resolveRequest(catalog, request(extra))
    return packagePlaceholders(plan, pkgOf(plan, dir)).FRONTEND_HOSTS
  }
  test('is one <dir>.localhost=<dir> per frontend, in request order', () => {
    expect(hosts()).toBe('site.localhost=site,admin.localhost=admin')
    expect(hosts({ frontends: [pair('app-crm'), pair('site')] })).toBe(
      'app-crm.localhost=app-crm,site.localhost=site',
    )
    expect(hosts({ frontends: undefined })).toBe('frontend.localhost=frontend')
  })
  test('is empty without a frontend and absent for a frontend package', () => {
    const alone = resolveRequest(catalog, { ...base, out: tempDir(), template: FN })
    expect(packagePlaceholders(alone, pkgOf(alone, FN)).FRONTEND_HOSTS).toBe('')
    expect(hosts({}, 'site')).toBeUndefined()
  })
  test('the generator writes it into a serverless file', () => {
    const root = copyFixture('catalog')
    const file = path.join(root, 'serverless/mini-fn/base/src/frontends.ts')
    writeFileSync(file, `${readFileSync(file, 'utf8')}export const hosts = '__FRONTEND_HOSTS__'\n`)
    const rooted = loadCatalog(root)
    const out = tempDir()
    generate(rooted, resolveRequest(rooted, request({ out })))
    expect(read(out, `${FN}/src/frontends.ts`)).toContain(
      "hosts = 'site.localhost=site,admin.localhost=admin'",
    )
  })
})

describe('provenance and answers', () => {
  test('one entry per package in plan order, the stack kept, and the schema accepts it', () => {
    const out = tempDir()
    generate(catalog, resolveRequest(catalog, request({ out })))
    const record = parse(read(out, '.fullstack/catalog.yaml'))
    expect(Object.keys(record.packages)).toEqual([FN, 'site', 'admin'])
    expect(record.stack).toBe('mini-site-fn')
    expect(record.packages.admin.template).toBe(SITE)
    expect(validateAgainst('provenance', record)).toEqual([])
  })
  test('a flag two frontends declare stays refused as a shorthand', () => {
    expect(() => resolveRequest(catalog, request({ flags: ['islands=true'] }))).toThrow(
      /flag islands is ambiguous: declared by site and admin; set it in an answers file/,
    )
  })
  test('an answers file sets the flag per directory', () => {
    const plan = resolveRequest(
      catalog,
      request({ answers: { packages: { admin: { flags: { islands: true } } } } }),
    )
    expect(pkgOf(plan, 'site').flags.islands).toBe(false)
    expect(pkgOf(plan, 'admin').flags.islands).toBe(true)
  })
  test('answers naming a directory outside the plan are refused', () => {
    expect(() =>
      resolveRequest(catalog, request({ answers: { packages: { frontend: { flags: {} } } } })),
    ).toThrow(/answers name package frontend, which is not in the plan/)
  })
})

describe('cases', () => {
  const CASE = [
    '  - name: two',
    '    stack: mini-site-fn',
    '    frontends: ["site=frontend/mini-site", "admin=frontend/mini-site"]',
    '    flags:',
    '      auth: false',
    '    packages:',
    '      admin:',
    '        flags:',
    '          islands: true',
    '',
  ].join('\n')
  const withCase = (yaml: string) => {
    const root = copyFixture('catalog')
    const file = path.join(root, 'frontend/mini-site/tests/cases.yaml')
    writeFileSync(file, readFileSync(file, 'utf8') + yaml)
    return root
  }
  const load = (yaml: string) => {
    const cases = loadCatalog(withCase(yaml))
    return { cases, found: listCases(cases).find((c) => c.id === 'frontend/mini-site/two')! }
  }
  test('parses frontends and per-package flags', () => {
    const { found } = load(CASE)
    expect(found.frontends).toEqual(['site=frontend/mini-site', 'admin=frontend/mini-site'])
    expect(found.packages).toEqual({ admin: { flags: { islands: true } } })
    expect(found.packageDir).toBe('site')
  })
  test('a case without them carries none, so every existing request is the same', () => {
    const found = listCases(catalog).find((c) => c.id === 'frontend/mini-site/default')!
    expect(found.frontends).toEqual([])
    expect(found.packages).toEqual({})
    expect(requestFor(found, 'out').frontends).toBeUndefined()
  })
  test('requestFor turns them into a frontend list and answers per directory', () => {
    const { found } = load(CASE)
    const req = requestFor(found, 'out')
    expect(req.stack).toBe('mini-site-fn')
    expect(req.frontends).toEqual([pair('site'), pair('admin')])
    expect(req.answers?.packages).toEqual({
      site: { flags: { auth: false }, capabilities: {} },
      admin: { flags: { islands: true } },
    })
  })
  test('refuses a packages entry that the case flags or server settings would overwrite', () => {
    const entry = (dir: string) =>
      ['    packages:', `      ${dir}:`, '        flags:', '          islands: true', ''].join('\n')
    const head = [
      '  - name: bad',
      '    stack: mini-site-fn',
      '    frontends: ["site=frontend/mini-site"]',
    ]
    expect(() => load([...head, entry('site')].join('\n'))).toThrow(
      /package "site".*use `flags:` \/ `server:`/s,
    )
    expect(() =>
      load([...head, '    server:', '      flags:', '        auth: false', entry(FN)].join('\n')),
    ).toThrow(/package "serverless\/mini-fn".*use `flags:` \/ `server:`/s)
    // The server's own entry stays free while the case sets nothing on the server.
    expect(() => load([...head, entry(FN).replace('islands', 'auth')].join('\n'))).not.toThrow()
  })
  test('refuses a packages entry whose capabilities the template does not declare', () => {
    const yaml = [
      '  - name: bad',
      '    stack: mini-site-fn',
      '    frontends: ["site=frontend/mini-site", "admin=frontend/mini-site"]',
      '    packages:',
      '      admin:',
      '        capabilities:',
      '          database: fake',
      '',
    ].join('\n')
    expect(() => load(yaml)).toThrow(
      /capability "database" on package "admin".*frontend\/mini-site/s,
    )
  })
  test('the runner generates the plan and runs every package check', async () => {
    const { cases, found } = load(CASE)
    const calls: { line: string; cwd: string }[] = []
    const options: Options = {
      e2e: true,
      installBrowsers: false,
      keep: false,
      withServices: false,
      withApp: false,
    }
    const out = tempDir()
    await runCase(
      cases,
      found,
      out,
      options,
      (line, cwd) => void calls.push({ line, cwd }),
      () => undefined,
    )
    expect(read(out, '.fullstack/catalog.yaml')).toContain('admin:')
    const cwds = calls.map((c) => path.relative(out, c.cwd).split(path.sep).join('/'))
    expect(cwds).toContain('site')
    expect(cwds).toContain('admin')
    expect(calls.filter((c) => c.line === 'bun ./ok.ts testE2e')).toHaveLength(2)
  })
  test.each([
    [
      'names no stack',
      '  - name: two\n    frontends: ["site=frontend/mini-site"]\n',
      /case "two" lists frontends or packages but names no stack/,
    ],
    [
      'lists a malformed entry',
      '  - name: two\n    stack: mini-site-fn\n    frontends: ["site"]\n',
      /frontends/,
    ],
    [
      'lists another template',
      '  - name: two\n    stack: mini-site-fn\n    frontends: ["a=frontend/mini-ui"]\n',
      /case "two" lists frontend "a" with frontend\/mini-ui, but the case is for frontend\/mini-site/,
    ],
    [
      'repeats a dir',
      '  - name: two\n    stack: mini-site-fn\n    frontends: ["a=frontend/mini-site", "a=frontend/mini-site"]\n',
      /case "two" lists frontend dir "a" twice/,
    ],
    [
      'sets packages for a dir outside the plan',
      '  - name: two\n    stack: mini-site-fn\n    packages:\n      nope:\n        flags:\n          islands: true\n',
      /case "two" sets package "nope", which is not in its plan/,
    ],
    [
      'sets an undeclared flag on a package',
      CASE.replace('islands: true', 'nope: true'),
      /case "two" sets flag "nope" on package "admin", which frontend\/mini-site does not declare/,
    ],
  ])('refuses a case that %s', (_what, yaml, message) => {
    expect(() => loadCatalog(withCase(yaml))).toThrow(message)
  })
})
