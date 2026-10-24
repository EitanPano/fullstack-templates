import { describe, expect, test } from 'bun:test'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { CatalogError, loadCatalog } from '../lib/catalog'
import { copyFixture, FIXTURE } from './helpers'

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

describe('loadCatalog', () => {
  test('loads templates and stacks keyed by path and id', () => {
    const catalog = loadCatalog(FIXTURE)
    expect([...catalog.templates.keys()].sort()).toEqual([
      'frontend/mini-spa',
      'frontend/mini-ui',
      'server/mini',
      'server/mini-py',
    ])
    expect(catalog.templates.get('server/mini')?.manifest.flags?.auth?.default).toBe(true)
    expect(catalog.stacks.get('mini')?.manifest.packages.map((p) => p.dir)).toEqual([
      'backend',
      'frontend',
    ])
  })

  test('loads each template cases file', () => {
    const catalog = loadCatalog(FIXTURE)
    expect(catalog.templates.get('server/mini')?.cases.cases.map((c) => c.name)).toEqual([
      'default',
      'auth-off',
      'fake',
      'auth-off-fake',
    ])
  })

  test('reports a listed template whose directory is missing', () => {
    expect(problems(path.join(import.meta.dir, 'fixtures', 'broken-index'))).toContain(
      'server/ghost',
    )
  })

  test('reports a listed stack whose directory is missing', () => {
    expect(problems(path.join(import.meta.dir, 'fixtures', 'broken-index'))).toContain(
      'stacks/mini',
    )
  })

  test('reports a contract.consumes that is not <kind>/<path>', () => {
    const root = copyFixture('catalog')
    edit(root, 'frontend/mini-ui/template.yaml', (t) =>
      t.replace('<server>/openapi.json', 'openapi.json'),
    )
    expect(problems(root)).toContain('contract.consumes')
  })

  test('reports a consumed kind the default stack does not provide', () => {
    const root = copyFixture('catalog')
    edit(root, 'frontend/mini-ui/template.yaml', (t) => t.replace('<server>', '<worker>'))
    const message = problems(root)
    expect(message).toContain('frontend/mini-ui')
    expect(message).toContain('worker')
    expect(message).toContain('"mini"')
  })

  test('reports a defaultStack that is not a stack', () => {
    const root = copyFixture('catalog')
    edit(root, 'server/mini/template.yaml', (t) =>
      t.replace('defaultStack: mini', 'defaultStack: nope'),
    )
    expect(problems(root)).toContain('nope')
  })

  test('reports a stack package whose template is not loaded', () => {
    const root = copyFixture('catalog')
    edit(root, 'stacks/mini/stack.yaml', (t) =>
      t.replace('template: server/mini', 'template: server/gone'),
    )
    expect(problems(root)).toContain('server/gone')
  })

  test('reports a duplicate stack package dir', () => {
    const root = copyFixture('catalog')
    edit(root, 'stacks/mini/stack.yaml', (t) => t.replace('dir: frontend', 'dir: backend'))
    expect(problems(root)).toContain('package dir "backend" is used twice')
  })

  test('reports a stack id that differs from the index', () => {
    const root = copyFixture('catalog')
    edit(root, 'stacks/mini/stack.yaml', (t) => t.replace('id: mini', 'id: other'))
    const message = problems(root)
    expect(message).toContain('stacks/mini')
    expect(message).toContain('other')
  })

  test('reports a stack summary that differs from the index', () => {
    const root = copyFixture('catalog')
    edit(root, 'stacks/mini/stack.yaml', (t) => t.replace('summary: Mini', 'summary: Changed'))
    const message = problems(root)
    expect(message).toContain('stacks/mini')
    expect(message).toContain('summary')
  })

  test.each([
    ['base/', 'frontend/mini-ui/base'],
    ['compose.yaml', 'frontend/mini-ui/compose.yaml'],
    ['tests/cases.yaml', 'frontend/mini-ui/tests/cases.yaml'],
    ['AGENTS.md', 'frontend/mini-ui/base/AGENTS.md'],
  ])('reports a missing template file %s', (expected, file) => {
    const root = copyFixture('catalog')
    rmSync(path.join(root, file), { recursive: true })
    const message = problems(root)
    expect(message).toContain('frontend/mini-ui')
    expect(message).toContain(expected)
  })

  test.each([
    'shared/docker/compose.yaml',
    'shared/editorconfig/.editorconfig',
    'shared/gitignore/base.gitignore',
  ])('reports a missing %s', (file) => {
    const root = copyFixture('catalog')
    rmSync(path.join(root, file))
    expect(problems(root)).toContain(file)
  })

  test('reports an index entry whose version differs from the manifest', () => {
    const root = copyFixture('catalog')
    edit(root, 'index.yaml', (t) => t.replace('version: 1.0.0', 'version: 9.9.9'))
    const message = problems(root)
    expect(message).toContain('server/mini')
    expect(message).toContain('version')
  })

  test('reports an onlyPath that does not exist in base', () => {
    const root = copyFixture('catalog')
    edit(root, 'server/mini/template.yaml', (t) =>
      t.replace('tests/auth.test.ts]', 'tests/auth.test.ts, src/missing.ts]'),
    )
    expect(problems(root)).toContain('src/missing.ts')
  })

  test('reports a template directory on disk that the index does not list', () => {
    const root = copyFixture('catalog')
    mkdirSync(path.join(root, 'server', 'orphan'))
    writeFileSync(path.join(root, 'server', 'orphan', 'template.yaml'), 'schemaVersion: 1\n')
    expect(problems(root)).toContain('server/orphan')
  })

  test('reports a case flag the template does not declare', () => {
    const root = copyFixture('catalog')
    edit(root, 'server/mini/tests/cases.yaml', (t) => t.replace('auth: false', 'oauth: false'))
    expect(problems(root)).toContain('oauth')
  })

  test('reports a case stack that is not a loaded stack', () => {
    const root = copyFixture('catalog')
    edit(root, 'frontend/mini-ui/tests/cases.yaml', (t) => t.replace('stack: mini', 'stack: nope'))
    expect(problems(root)).toContain('nope')
  })

  test('reports an index template path that is not <kind>/<id>', () => {
    const root = copyFixture('catalog')
    edit(root, 'index.yaml', (t) => t.replace('path: server/mini', 'path: server/other'))
    expect(problems(root)).toContain('path must be server/mini')
  })

  test('reports an index stack path that is not stacks/<id>', () => {
    const root = copyFixture('catalog')
    edit(root, 'index.yaml', (t) => t.replace('path: stacks/mini', 'path: stacks/other'))
    expect(problems(root)).toContain('path must be stacks/mini')
  })

  test('reports a case whose stack has no package for the template', () => {
    const root = copyFixture('catalog')
    edit(root, 'server/mini/tests/cases.yaml', (t) =>
      t.replace('name: auth-off', 'name: auth-off\n    stack: other'),
    )
    mkdirSync(path.join(root, 'stacks', 'other'))
    const stack = [
      'schemaVersion: 1',
      'id: other',
      'summary: Other',
      'packages:',
      '  - template: frontend/mini-ui',
      '    dir: frontend',
      '',
    ]
    writeFileSync(path.join(root, 'stacks', 'other', 'stack.yaml'), stack.join('\n'))
    const entry = ['  - id: other', '    path: stacks/other', '    summary: Other', '']
    edit(root, 'index.yaml', (t) => t + entry.join('\n'))
    expect(problems(root)).toContain('has no package for this template')
  })

  test('reports a template with no default case', () => {
    const root = copyFixture('catalog')
    edit(root, 'server/mini/tests/cases.yaml', (t) => t.replace('name: default', 'name: base'))
    expect(problems(root)).toContain('server/mini: tests/cases.yaml has no case named "default"')
  })

  test('reports a flag no case sets to its non-default value', () => {
    const root = copyFixture('catalog')
    edit(root, 'server/mini/tests/cases.yaml', (t) => t.replaceAll('auth: false', 'auth: true'))
    expect(problems(root)).toContain('no case sets flag "auth" to false')
  })

  test('reports a missing shared file', () => {
    const root = copyFixture('catalog')
    edit(root, 'server/mini/template.yaml', (t) =>
      t.replace('gitignore: [node]', 'gitignore: [go]'),
    )
    expect(problems(root)).toContain('shared/gitignore/go.gitignore')
  })

  test('loads the fixture provider and overlay', () => {
    const catalog = loadCatalog(FIXTURE)
    expect([...catalog.providers.keys()]).toEqual(['database/fake'])
    const provider = catalog.providers.get('database/fake')
    expect(provider?.dir).toBe(path.join(FIXTURE, 'shared', 'providers', 'database', 'fake'))
    expect(provider?.manifest.service).toBe('database')
    expect(provider?.manifest.env[0]?.name).toBe('DATABASE_URL')
    expect(provider?.manifest.files).toEqual(['db/init.sql'])
    const template = catalog.templates.get('server/mini')
    expect([...(template?.overlays.keys() ?? [])]).toEqual(['database/fake'])
    const overlay = template?.overlays.get('database/fake')
    expect(overlay?.dir).toBe(
      path.join(FIXTURE, 'server', 'mini', 'capabilities', 'database', 'fake'),
    )
    expect(overlay?.overlayDir).toBe(path.join(overlay?.dir ?? '', 'overlay'))
    expect(overlay?.manifest.commands).toEqual({
      testDb: 'bun run test:db',
      migrate: 'bun run db:migrate',
    })
    expect(overlay?.manifest.scripts?.['test:db']).toBe('bun ./ok.ts')
    expect(catalog.templates.get('frontend/mini-ui')?.overlays.size).toBe(0)
  })

  test('loads a catalog without shared/providers', () => {
    const root = copyFixture('catalog')
    rmSync(path.join(root, 'shared', 'providers'), { recursive: true, force: true })
    rmSync(path.join(root, 'server', 'mini', 'capabilities'), { recursive: true, force: true })
    edit(root, 'server/mini/template.yaml', (text) =>
      text.replace('providers: [fake]', 'providers: []'),
    )
    edit(root, 'server/mini/tests/cases.yaml', (text) =>
      text.slice(0, text.indexOf('  - name: fake')),
    )
    expect(loadCatalog(root).providers.size).toBe(0)
  })
})

describe('loadCatalog providers and capabilities', () => {
  const providerDir = 'shared/providers/database/fake'
  const overlayDir = 'server/mini/capabilities/database/fake'
  const casesFile = 'server/mini/tests/cases.yaml'

  test('reports a provider directory that is not a capability kind', () => {
    const root = copyFixture('catalog')
    mkdirSync(path.join(root, 'shared', 'providers', 'queue', 'x'), { recursive: true })
    expect(problems(root)).toContain('shared/providers/queue: not a capability kind')
  })

  test('reports an invalid provider manifest naming its path', () => {
    const root = copyFixture('catalog')
    edit(root, `${providerDir}/provider.yaml`, (t) => t.replace('service: database\n', ''))
    const message = problems(root)
    expect(message).toContain(`${providerDir}/provider.yaml`)
    expect(message).toContain('service')
  })

  test('reports a provider directory without a manifest', () => {
    const root = copyFixture('catalog')
    rmSync(path.join(root, providerDir, 'provider.yaml'))
    expect(problems(root)).toContain(`${providerDir}/provider.yaml: missing`)
  })

  test('reports a provider whose id differs from its directory', () => {
    const root = copyFixture('catalog')
    edit(root, `${providerDir}/provider.yaml`, (t) => t.replace('id: fake', 'id: other'))
    expect(problems(root)).toContain(`${providerDir}: id "other" differs from the directory`)
  })

  test('reports a provider whose kind differs from its directory', () => {
    const root = copyFixture('catalog')
    edit(root, `${providerDir}/provider.yaml`, (t) => t.replace('kind: database', 'kind: cache'))
    expect(problems(root)).toContain(`${providerDir}: kind "cache" differs from the directory`)
  })

  test('reports a provider whose compose file is missing', () => {
    const root = copyFixture('catalog')
    rmSync(path.join(root, providerDir, 'compose.yaml'))
    expect(problems(root)).toContain(`${providerDir}: compose file compose.yaml is missing`)
  })

  test('reports a provider file that is missing', () => {
    const root = copyFixture('catalog')
    rmSync(path.join(root, providerDir, 'db', 'init.sql'))
    expect(problems(root)).toContain(`${providerDir}: file db/init.sql is missing`)
  })

  test('reports an invalid capability manifest naming its path', () => {
    const root = copyFixture('catalog')
    edit(root, `${overlayDir}/capability.yaml`, (t) =>
      t.replace('summary: The fake database\n', ''),
    )
    const message = problems(root)
    expect(message).toContain(`${overlayDir}/capability.yaml`)
    expect(message).toContain('summary')
  })

  test('reports a capability flag the template does not declare', () => {
    const root = copyFixture('catalog')
    edit(root, `${overlayDir}/capability.yaml`, (t) => t.replace('  auth:\n', '  ghost:\n'))
    expect(problems(root)).toContain(
      `${overlayDir}/capability.yaml: flag "ghost" is not declared by the template`,
    )
  })

  test('reports a capability flag onlyPath missing from overlay/', () => {
    const root = copyFixture('catalog')
    rmSync(path.join(root, overlayDir, 'overlay', 'src', 'auth-database.ts'))
    expect(problems(root)).toContain(
      `${overlayDir}/capability.yaml: flag "auth" onlyPath "src/auth-database.ts" does not exist in overlay/`,
    )
  })

  test('reports a capability flag onlyPath that also exists in base/', () => {
    // Such a path escapes the pins and, with the flag off, would delete the base file too.
    const root = copyFixture('catalog')
    edit(root, `${overlayDir}/capability.yaml`, (t) =>
      t.replace('onlyPaths: [src/auth-database.ts]', 'onlyPaths: [src/auth.ts]'),
    )
    expect(problems(root)).toContain(
      `${overlayDir}/capability.yaml: flag "auth" onlyPath "src/auth.ts" exists in base/: an onlyPath must be a file the overlay adds`,
    )
  })

  test('reports a listed provider without a capability directory', () => {
    const root = copyFixture('catalog')
    rmSync(path.join(root, overlayDir), { recursive: true })
    expect(problems(root)).toContain(`${overlayDir}: directory is missing`)
  })

  test('reports a capability manifest that is missing', () => {
    const root = copyFixture('catalog')
    rmSync(path.join(root, overlayDir, 'capability.yaml'))
    expect(problems(root)).toContain(`${overlayDir}/capability.yaml: missing`)
  })

  test('reports an overlay/ directory that is missing', () => {
    const root = copyFixture('catalog')
    rmSync(path.join(root, overlayDir, 'overlay'), { recursive: true })
    expect(problems(root)).toContain(`${overlayDir}: overlay/ is missing`)
  })

  test('reports a capability whose provider differs from its path', () => {
    const root = copyFixture('catalog')
    edit(root, `${overlayDir}/capability.yaml`, (t) =>
      t.replace('provider: fake', 'provider: other'),
    )
    expect(problems(root)).toContain(`${overlayDir}: provider "other" differs from the path`)
  })

  test('reports a capability whose kind differs from its path', () => {
    const root = copyFixture('catalog')
    edit(root, `${overlayDir}/capability.yaml`, (t) => t.replace('kind: database', 'kind: cache'))
    expect(problems(root)).toContain(`${overlayDir}: kind "cache" differs from the path`)
  })

  test('reports a listed provider that does not exist in shared/providers', () => {
    const root = copyFixture('catalog')
    rmSync(path.join(root, providerDir), { recursive: true })
    expect(problems(root)).toContain(
      `${overlayDir}: provider database/fake is not in shared/providers`,
    )
  })

  test('reports a command the template already defines', () => {
    const root = copyFixture('catalog')
    edit(root, 'server/mini/template.yaml', (t) =>
      t.replace('  contract: bun ./ok.ts', '  contract: bun ./ok.ts\n  migrate: bun ./ok.ts'),
    )
    expect(problems(root)).toContain(
      `${overlayDir}/capability.yaml: command "migrate" is already defined by the template`,
    )
  })

  test('reports a script the template manifest already defines', () => {
    const root = copyFixture('catalog')
    edit(root, 'server/mini/base/package.json', (t) =>
      t.replace('"dependencies"', '"scripts": { "db:migrate": "x" },\n  "dependencies"'),
    )
    expect(problems(root)).toContain(
      `${overlayDir}/capability.yaml: script "db:migrate" is already defined by base/package.json`,
    )
  })

  test('reports scripts or dependencies on a template without a dependencies adapter', () => {
    const root = copyFixture('catalog')
    edit(root, 'server/mini/template.yaml', (t) =>
      t.replace('dependencies:\n  manifest: package.json\n  adapter: npm\n', ''),
    )
    expect(problems(root)).toContain(
      `${overlayDir}/capability.yaml: scripts or dependencies need a template with a dependencies adapter`,
    )
  })

  test('reports a capability directory that is not a capability kind', () => {
    const root = copyFixture('catalog')
    mkdirSync(path.join(root, 'server', 'mini', 'capabilities', 'queue'))
    expect(problems(root)).toContain('server/mini/capabilities/queue: not a capability kind')
  })

  test('reports a capability directory the template does not list', () => {
    const root = copyFixture('catalog')
    mkdirSync(path.join(root, 'server', 'mini', 'capabilities', 'database', 'extra'))
    expect(problems(root)).toContain(
      'server/mini/capabilities/database/extra: not listed in template.yaml capabilities',
    )
  })

  test('reports a provider no template lists', () => {
    const root = copyFixture('catalog')
    const spare = 'shared/providers/database/spare'
    cpSync(path.join(root, providerDir), path.join(root, spare), { recursive: true })
    edit(root, `${spare}/provider.yaml`, (t) => t.replace('id: fake', 'id: spare'))
    expect(problems(root)).toContain(`${spare}: no template lists this provider`)
  })

  test('reports a case capability of a kind the template does not declare', () => {
    const root = copyFixture('catalog')
    edit(root, casesFile, (t) => t.replace('      database: fake', '      cache: fake'))
    expect(problems(root)).toContain('case "fake" uses undeclared capability "cache"')
  })

  test('reports a case capability naming a provider the template does not list', () => {
    const root = copyFixture('catalog')
    edit(root, casesFile, (t) => t.replace('      database: fake', '      database: nope'))
    expect(problems(root)).toContain('case "fake" uses unlisted provider "nope" for database')
  })

  test('reports a provider with no case that selects only it at the default flags', () => {
    const root = copyFixture('catalog')
    edit(root, casesFile, (t) =>
      t.replace('name: fake\n', 'name: fake\n    flags:\n      auth: false\n'),
    )
    expect(problems(root)).toContain(
      'server/mini: no case selects only database=fake with the default flags',
    )
  })

  test('reports a provider with no case that turns every flag off', () => {
    const root = copyFixture('catalog')
    edit(root, casesFile, (t) => t.replace('flags:\n      auth: false\n    capab', 'capab'))
    expect(problems(root)).toContain(
      'server/mini: no case selects database=fake with every flag false',
    )
  })
})

describe('loadCatalog with the pyproject adapter', () => {
  const py = 'server/mini-py'
  const overlayDir = `${py}/capabilities/database/fake`

  // mini-py plus a database=fake overlay whose manifest carries `extra` (YAML text).
  function withOverlay(extra: string): string {
    const root = copyFixture('catalog')
    edit(
      root,
      `${py}/template.yaml`,
      (t) => `${t}capabilities:\n  database:\n    providers: [fake]\n`,
    )
    edit(
      root,
      `${py}/tests/cases.yaml`,
      (t) =>
        `${t}  - name: fake\n    capabilities:\n      database: fake\n  - name: auth-off-fake\n    flags:\n      auth: false\n    capabilities:\n      database: fake\n`,
    )
    mkdirSync(path.join(root, overlayDir, 'overlay', 'src'), { recursive: true })
    writeFileSync(path.join(root, overlayDir, 'overlay', 'src', 'db.py'), 'x = 1\n')
    writeFileSync(
      path.join(root, overlayDir, 'capability.yaml'),
      `schemaVersion: 1\nkind: database\nprovider: fake\nsummary: Fake\n${extra}`,
    )
    return root
  }

  test('loads a clean pyproject template and overlay', () => {
    expect(() => loadCatalog(withOverlay(''))).not.toThrow()
  })

  test('refuses a flag with dependencies, pointing at markers', () => {
    const root = copyFixture('catalog')
    edit(root, `${py}/template.yaml`, (t) =>
      t.replace(
        '    default: true\n',
        '    default: true\n    dependencies:\n      remove: [idna]\n',
      ),
    )
    const message = problems(root)
    expect(message).toContain(`${py}: flag "auth"`)
    expect(message).toContain('use markers in pyproject.toml')
  })

  test('refuses a capability with dependencies', () => {
    const message = problems(withOverlay('dependencies:\n  remove: [idna]\n'))
    expect(message).toContain(`${overlayDir}/capability.yaml: dependencies`)
    expect(message).toContain('use markers in pyproject.toml')
  })

  test('refuses a capability with scripts', () => {
    const message = problems(withOverlay('scripts:\n  migrate: echo hi\n'))
    expect(message).toContain(`${overlayDir}/capability.yaml: scripts`)
    expect(message).toContain('use markers in pyproject.toml')
  })

  test('does not read pyproject.toml as JSON for a capability with no scripts', () => {
    const root = withOverlay('commands:\n  migrate: uv run migrate\n')
    expect(() => loadCatalog(root)).not.toThrow()
  })

  test.each(['..', '../x', '/abs', 'a/../b', 'C:/x', 'a\\b', '.', 'a/./b', './a', 'a/.'])(
    'refuses dropAfterPostGenerate entry %s, naming the template',
    (entry) => {
      const root = copyFixture('catalog')
      edit(root, `${py}/template.yaml`, (t) => `${t}dropAfterPostGenerate: ['${entry}']\n`)
      const message = problems(root)
      expect(message).toContain(`${py}/template.yaml`)
      expect(message).toContain('dropAfterPostGenerate')
    },
  )

  test('loads dropAfterPostGenerate relative paths', () => {
    const root = copyFixture('catalog')
    edit(root, `${py}/template.yaml`, (t) => `${t}dropAfterPostGenerate: [.venv, a/b]\n`)
    const loaded = loadCatalog(root).templates.get(py)
    expect(loaded?.manifest.dropAfterPostGenerate).toEqual(['.venv', 'a/b'])
  })

  test('loads container and pins', () => {
    const blob = 'a'.repeat(40)
    const root = withOverlay(
      `container:\n  migrate: python -m app.migrate\npins:\n  src/db.py: ${blob}\n`,
    )
    const overlay = loadCatalog(root).templates.get(py)?.overlays.get('database/fake')
    expect(overlay?.manifest.container).toEqual({ migrate: 'python -m app.migrate' })
    expect(overlay?.manifest.pins).toEqual({ 'src/db.py': blob })
  })

  test.each([
    ['a container without migrate', 'container: {}\n'],
    ['a container with a shell pipe', "container:\n  migrate: 'a | b'\n"],
    ['a container with an extra key', 'container:\n  migrate: a\n  other: b\n'],
    ['a pin that is not 40 hex', 'pins:\n  src/db.py: abc123\n'],
    ['an uppercase pin', `pins:\n  src/db.py: ${'A'.repeat(40)}\n`],
    ['a pin path with ..', `pins:\n  ../db.py: ${'a'.repeat(40)}\n`],
    ['an absolute pin path', `pins:\n  /db.py: ${'a'.repeat(40)}\n`],
  ])('refuses %s', (_name, extra) => {
    expect(problems(withOverlay(extra))).toContain(`${overlayDir}/capability.yaml`)
  })
})

describe('loadCatalog: server agents headings', () => {
  const mini = 'server/mini'

  test('refuses a server template whose agents file lacks a heading, naming both', () => {
    const root = copyFixture('catalog')
    edit(root, `${mini}/base/AGENTS.md`, (t) => t.replace('## Errors\n', ''))
    const message = problems(root)
    expect(message).toContain(mini)
    expect(message).toContain('"Errors"')
    expect(message).not.toContain('"Tests"')
  })

  test('lists every missing heading', () => {
    const root = copyFixture('catalog')
    writeFileSync(path.join(root, `${mini}/base/AGENTS.md`), '# Mini\n\n### Tests\n')
    const message = problems(root)
    expect(message).toContain('"Adding a module", "Adding the data layer", "Errors"')
  })

  test('matches the exact text of a heading line, not a mention or a longer title', () => {
    const root = copyFixture('catalog')
    edit(root, `${mini}/base/AGENTS.md`, (t) =>
      t.replace('## Errors\n', 'See Errors below.\n## Errors and retries\n'),
    )
    expect(problems(root)).toContain('"Errors"')
  })

  test('ignores a heading inside a fenced block, backticks or tildes', () => {
    for (const fence of ['```', '~~~']) {
      const root = copyFixture('catalog')
      edit(root, `${mini}/base/AGENTS.md`, (t) =>
        t.replace('## Tests\n', `${fence}sh\n# Tests\n${fence}\n`),
      )
      expect(problems(root)).toContain('"Tests"')
    }
  })

  test('a longer fence is not closed by a shorter one', () => {
    const root = copyFixture('catalog')
    edit(root, `${mini}/base/AGENTS.md`, (t) =>
      t.replace('## Tests\n', '````md\n```\n## Tests\n````\n'),
    )
    expect(problems(root)).toContain('"Tests"')
  })

  test('counts a heading after the fence closes', () => {
    const root = copyFixture('catalog')
    edit(root, `${mini}/base/AGENTS.md`, (t) =>
      t.replace('## Tests\n', '```sh\n# x\n```\n## Tests\n'),
    )
    expect(() => loadCatalog(root)).not.toThrow()
  })

  test('accepts a heading with closing hashes', () => {
    const root = copyFixture('catalog')
    edit(root, `${mini}/base/AGENTS.md`, (t) => t.replace('## Errors\n', '## Errors ##\n'))
    expect(() => loadCatalog(root)).not.toThrow()
  })

  test('refuses a server template whose agents file lacks Deployment', () => {
    const root = copyFixture('catalog')
    edit(root, `${mini}/base/AGENTS.md`, (t) => t.replace('## Deployment\n', ''))
    const message = problems(root)
    expect(message).toContain(mini)
    expect(message).toContain('"Deployment"')
    expect(message).not.toContain('"Errors"')
  })
})

describe('loadCatalog: frontend agents headings', () => {
  const ui = 'frontend/mini-ui'
  const FIVE = ['Adding a feature', 'Styling', 'Errors', 'Tests', 'Deployment']

  test('accepts a frontend with the five headings and no layer map heading', () => {
    const root = copyFixture('catalog')
    const text = FIVE.map((heading) => `## ${heading}\n`).join('\n')
    writeFileSync(path.join(root, `${ui}/base/AGENTS.md`), text)
    expect(() => loadCatalog(root)).not.toThrow()
  })

  test.each(FIVE)('refuses a frontend template whose agents file lacks %s', (heading) => {
    const root = copyFixture('catalog')
    edit(root, `${ui}/base/AGENTS.md`, (t) => t.replace(`## ${heading}\n`, ''))
    const message = problems(root)
    expect(message).toContain(ui)
    expect(message).toContain(`"${heading}"`)
    for (const other of FIVE.filter((h) => h !== heading)) {
      expect(message).not.toContain(`"${other}"`)
    }
  })

  test('lists every missing heading of a bare agents file', () => {
    const root = copyFixture('catalog')
    writeFileSync(path.join(root, `${ui}/base/AGENTS.md`), '# UI\n')
    expect(problems(root)).toContain(
      '"Adding a feature", "Styling", "Errors", "Tests", "Deployment"',
    )
  })

  test('ignores a heading inside a fenced block', () => {
    const root = copyFixture('catalog')
    edit(root, `${ui}/base/AGENTS.md`, (t) =>
      t.replace('## Deployment\n', '```sh\n# Deployment\n```\n'),
    )
    expect(problems(root)).toContain('"Deployment"')
  })
})

describe('loadCatalog: the static field and the reserved single', () => {
  test('keeps static on a frontend', () => {
    const manifest = loadCatalog(FIXTURE).templates.get('frontend/mini-spa')?.manifest
    expect(manifest?.static).toEqual({ out: 'dist' })
  })

  test('refuses static on a server template, naming it', () => {
    const root = copyFixture('catalog')
    edit(root, 'server/mini/template.yaml', (t) =>
      t.replace('http:', 'static:\n  out: dist\nhttp:'),
    )
    const message = problems(root)
    expect(message).toContain('server/mini')
    expect(message).toContain('static')
  })

  test('refuses a manifest that declares a flag named single', () => {
    const root = copyFixture('catalog')
    edit(root, 'server/mini/template.yaml', (t) =>
      t.replace('flags:\n', 'flags:\n  single:\n    summary: One image\n    default: false\n'),
    )
    expect(problems(root)).toContain('server/mini/template.yaml')
  })
})
