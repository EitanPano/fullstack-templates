import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { parse, parseDocument } from 'yaml'
import { loadCatalog } from '../lib/catalog'
import { removeTree } from '../lib/files'
import {
  GenerateError,
  Mover,
  STAGING_DIR,
  assertInside,
  generate,
  packagePlaceholders,
} from '../lib/generate'
import { catalogIdentity } from '../lib/provenance'
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

describe('generate', () => {
  test('produces both packages, root files and provenance', () => {
    const out = tempDir()
    const result = generate(catalog, resolveRequest(catalog, request(out)))
    expect(result.packages).toEqual(['backend', 'frontend'])
    expect(existsSync(path.join(out, 'backend', 'src', 'auth.ts'))).toBe(true)
    expect(readFileSync(path.join(out, 'backend', 'package.json'), 'utf8')).toContain(
      '"name": "demo-backend"',
    )
    expect(readFileSync(path.join(out, 'backend', 'src', 'index.ts'), 'utf8')).not.toContain(
      '@auth',
    )
    const compose = parse(readFileSync(path.join(out, 'docker-compose.yml'), 'utf8'))
    expect(compose.name).toBe('demo')
    expect(compose.services.backend.build).toBe('./backend')
    expect(compose.services.backend.environment.SECRET).toBe('${SECRET}')
    expect(readFileSync(path.join(out, 'docker-compose.yml'), 'utf8')).toContain(
      '# keep this comment',
    )
    expect(compose.services.frontend.environment.API_URL).toBe('http://backend:4000')
    expect(readFileSync(path.join(out, '.gitignore'), 'utf8')).toContain(
      'fullstack-templates: node',
    )
    const provenance = parse(readFileSync(path.join(out, '.fullstack', 'catalog.yaml'), 'utf8'))
    expect(provenance.packages.backend.flags).toEqual({ auth: true })
    expect(provenance.packages.frontend.commands.check).toBe('bun ./ok.ts')
    expect(existsSync(path.join(out, STAGING_DIR))).toBe(false)
    expect(readFileSync(path.join(out, 'backend', 'logo.png'))).toEqual(
      readFileSync(path.join(FIXTURE, 'server/mini/base/logo.png')),
    )
  })

  test('auth off removes the only-paths, the dependency and the compose line', () => {
    const out = tempDir()
    generate(catalog, resolveRequest(catalog, request(out, { flags: ['auth=false'] })))
    expect(existsSync(path.join(out, 'backend', 'src', 'auth.ts'))).toBe(false)
    expect(existsSync(path.join(out, 'backend', 'tests'))).toBe(false)
    expect(
      JSON.parse(readFileSync(path.join(out, 'backend', 'package.json'), 'utf8')).dependencies.jose,
    ).toBeUndefined()
    expect(
      parse(readFileSync(path.join(out, 'docker-compose.yml'), 'utf8')).services.backend.environment
        .SECRET,
    ).toBeUndefined()
  })

  test('keeps existing root files and merges .gitignore', () => {
    const out = tempDir()
    writeFileSync(path.join(out, '.editorconfig'), 'mine\n')
    writeFileSync(path.join(out, '.gitignore'), '*.log\n')
    generate(catalog, resolveRequest(catalog, request(out)))
    expect(readFileSync(path.join(out, '.editorconfig'), 'utf8')).toBe('mine\n')
    expect(readFileSync(path.join(out, '.gitignore'), 'utf8').startsWith('*.log\n')).toBe(true)
  })

  test('refuses an existing package directory before writing anything', () => {
    const out = tempDir()
    mkdirSync(path.join(out, 'backend'))
    expect(() => generate(catalog, resolveRequest(catalog, request(out)))).toThrow(GenerateError)
    expect(existsSync(path.join(out, 'frontend'))).toBe(false)
    expect(existsSync(path.join(out, 'docker-compose.yml'))).toBe(false)
  })

  test('a failing postGenerate command leaves the target untouched and names the package', () => {
    const root = copyFixture('catalog')
    const manifestPath = path.join(root, 'server/mini/template.yaml')
    writeFileSync(
      manifestPath,
      readFileSync(manifestPath, 'utf8').replace('install: bun ./ok.ts', 'install: bun ./fail.ts'),
    )
    const out = tempDir()
    const failing = loadCatalog(root)
    expect(() =>
      generate(failing, resolveRequest(failing, request(out, { skipPostGenerate: false }))),
    ).toThrow(/backend.*bun \.\/fail\.ts/)
    expect(existsSync(path.join(out, 'backend'))).toBe(false)
    expect(existsSync(path.join(out, STAGING_DIR))).toBe(false)
  })

  test('an undeclared marker in base fails generation', () => {
    const root = copyFixture('catalog')
    writeFileSync(path.join(root, 'server/mini/base/src/extra.ts'), 'x // @oauth\n')
    const out = tempDir()
    const marked = loadCatalog(root)
    expect(() => generate(marked, resolveRequest(marked, request(out)))).toThrow('extra.ts:1')
    expect(existsSync(path.join(out, 'backend'))).toBe(false)
  })

  test('a lone frontend skips the contract step and still generates', () => {
    const out = tempDir()
    const lines: string[] = []
    generate(
      catalog,
      resolveRequest(
        catalog,
        request(out, { stack: undefined, template: 'frontend/mini-ui', skipPostGenerate: false }),
      ),
      { log: (l) => lines.push(l) },
    )
    expect(lines.some((l) => /contract.*skipped/.test(l))).toBe(true)
    expect(existsSync(path.join(out, 'frontend', 'src', 'client.ts'))).toBe(true)
  })
})

const edit = (file: string, from: string, to: string) =>
  writeFileSync(file, readFileSync(file, 'utf8').replace(from, to))

const git = (cwd: string, ...args: string[]) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr)
}

describe('generate: the move', () => {
  test('a failure during the move puts the target back as it was', () => {
    const out = tempDir()
    writeFileSync(path.join(out, '.fullstack'), 'a plain file')
    expect(() => generate(catalog, resolveRequest(catalog, request(out)))).toThrow(GenerateError)
    expect(existsSync(path.join(out, 'backend'))).toBe(false)
    expect(existsSync(path.join(out, 'frontend'))).toBe(false)
    expect(readFileSync(path.join(out, '.fullstack'), 'utf8')).toBe('a plain file')
    expect(existsSync(path.join(out, STAGING_DIR))).toBe(false)
  })

  test('a rerun merges the packages already recorded in the provenance', () => {
    const out = tempDir()
    const only = (template: string) =>
      resolveRequest(catalog, request(out, { stack: undefined, template }))
    generate(catalog, only('server/mini'))
    generate(catalog, only('frontend/mini-ui'))
    const provenance = parse(readFileSync(path.join(out, '.fullstack', 'catalog.yaml'), 'utf8'))
    expect(Object.keys(provenance.packages).sort()).toEqual(['backend', 'frontend'])
  })
})

describe('catalogIdentity', () => {
  test('a directory that is not a repository root is local and unversioned', () => {
    const root = copyFixture('catalog')
    expect(catalogIdentity(root)).toEqual({
      repository: 'local',
      version: 'unversioned',
      commit: null,
    })
  })

  test('reads the commit, strips credentials and picks the highest version tag', () => {
    const root = copyFixture('catalog')
    git(root, 'init', '-q')
    git(root, 'add', '.')
    git(
      root,
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-q',
      '-m',
      'init',
    )
    git(root, 'remote', 'add', 'origin', 'https://u:t@example.com/x.git')
    const first = catalogIdentity(root)
    expect(first.repository).toBe('https://example.com/x.git')
    expect(first.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(first.version).toBe('unversioned')
    git(root, '-c', 'tag.gpgSign=false', 'tag', 'v0.1.0')
    git(root, '-c', 'tag.gpgSign=false', 'tag', 'v0.2.0')
    expect(catalogIdentity(root).version).toBe('v0.2.0')
  })
})

describe('generate: edges', () => {
  test('packagePlaceholders falls back to the conventional server when the plan has none', () => {
    const plan = resolveRequest(
      catalog,
      request(tempDir(), { stack: undefined, template: 'frontend/mini-ui' }),
    )
    const lines: string[] = []
    const values = packagePlaceholders(plan, plan.packages[0]!, (l) => lines.push(l))
    expect(values).toMatchObject({
      SERVER_DIR: 'backend',
      SERVER_PORT: '4000',
      SERVER_DEV_COMMAND: 'bun run dev',
      PORT: '3000',
    })
    expect(lines).toHaveLength(1)
  })

  test('a lone frontend with a compose fragment logs the server assumption once', () => {
    const lines: string[] = []
    generate(
      catalog,
      resolveRequest(
        catalog,
        request(tempDir(), { stack: undefined, template: 'frontend/mini-ui' }),
      ),
      { log: (l) => lines.push(l) },
    )
    expect(lines.filter((l) => /server references/.test(l))).toHaveLength(1)
  })

  test('a missing onlyPaths entry fails and names the path', () => {
    const root = copyFixture('catalog')
    const broken = loadCatalog(root)
    rmSync(path.join(root, 'server/mini/base/src/auth.ts')) // removed after loading: the loader checks onlyPaths
    expect(() =>
      generate(broken, resolveRequest(broken, request(tempDir(), { flags: ['auth=false'] }))),
    ).toThrow('src/auth.ts')
  })

  test('a declared placeholder left in a file fails and names the file', () => {
    const root = copyFixture('catalog')
    writeFileSync(path.join(root, 'server/mini/base/src/note.ts'), 'const x = "__OTHER__"\n')
    edit(
      path.join(root, 'server/mini/template.yaml'),
      'placeholders: [PROJECT_NAME]',
      'placeholders: [PROJECT_NAME, OTHER]',
    )
    const broken = loadCatalog(root)
    expect(() => generate(broken, resolveRequest(broken, request(tempDir())))).toThrow(/note.ts/)
  })

  test('keepStaging leaves the staging directory after a failure', () => {
    const root = copyFixture('catalog')
    writeFileSync(path.join(root, 'server/mini/base/src/extra.ts'), 'x // @oauth\n')
    const broken = loadCatalog(root)
    const out = tempDir()
    expect(() =>
      generate(broken, resolveRequest(broken, request(out)), { keepStaging: true }),
    ).toThrow(GenerateError)
    expect(existsSync(path.join(out, STAGING_DIR))).toBe(true)
  })

  test('a CRLF line keeps its carriage return when its marker is stripped', () => {
    const root = copyFixture('catalog')
    writeFileSync(path.join(root, 'server/mini/base/src/crlf.ts'), 'a // @auth\r\nb\r\n')
    const crlf = loadCatalog(root)
    const out = tempDir()
    generate(crlf, resolveRequest(crlf, request(out)))
    expect(readFileSync(path.join(out, 'backend', 'src', 'crlf.ts'), 'utf8')).toBe('a\r\nb\r\n')
  })

  test('the merged .gitignore keeps the original lines and both sections', () => {
    const out = tempDir()
    writeFileSync(path.join(out, '.gitignore'), '*.log\n')
    generate(catalog, resolveRequest(catalog, request(out)))
    const merged = readFileSync(path.join(out, '.gitignore'), 'utf8')
    expect(merged).toContain('*.log')
    expect(merged).toContain('fullstack-templates: base')
    expect(merged).toContain('fullstack-templates: node')
  })
})

describe('assertInside', () => {
  const root = path.resolve('/work/staging/backend')
  test('accepts a path below the root', () => {
    expect(() => assertInside(root, path.join(root, 'src', 'a.ts'), 'x')).not.toThrow()
  })
  test.each(['..', '../other', 'src/../../other', ''])('refuses %p', (rel) => {
    expect(() => assertInside(root, path.join(root, rel), 'x')).toThrow(GenerateError)
  })
})

describe('Mover', () => {
  function layout() {
    const root = tempDir()
    const staging = path.join(root, 'staging')
    mkdirSync(path.join(staging, 'new'), { recursive: true })
    writeFileSync(path.join(staging, 'new', 'f.txt'), 'new')
    mkdirSync(path.join(root, 'target'))
    writeFileSync(path.join(root, 'target', 'old.txt'), 'old')
    return { staging, from: path.join(staging, 'new'), to: path.join(root, 'target') }
  }

  test('a clean rollback restores the replaced directory and reports nothing', () => {
    const { staging, from, to } = layout()
    const mover = new Mover(staging)
    mover.move(from, to)
    expect(readFileSync(path.join(to, 'f.txt'), 'utf8')).toBe('new')
    expect(mover.rollback()).toBeNull()
    expect(readFileSync(path.join(to, 'old.txt'), 'utf8')).toBe('old')
  })

  test('a failing undo step reports the backup paths so the caller keeps them', () => {
    const { staging, from, to } = layout()
    let failing = false
    const mover = new Mover(staging, (a, b) => {
      if (failing) throw new Error('disk gone')
      renameSync(a, b)
    })
    mover.move(from, to)
    failing = true
    expect(mover.rollback()).toEqual([path.join(staging, 'replaced-0')])
    expect(existsSync(path.join(staging, 'replaced-0', 'old.txt'))).toBe(true)
  })

  const codeError = (code: string) => Object.assign(new Error(`${code}: rename`), { code })

  test('a transient EPERM on a rename is retried and the move succeeds', () => {
    const { staging, from, to } = layout()
    const calls: Array<[string, string]> = []
    const delays: number[] = []
    const mover = new Mover(
      staging,
      (a, b) => {
        calls.push([a, b])
        if (calls.length === 1) throw codeError('EPERM')
        renameSync(a, b)
      },
      (ms) => {
        delays.push(ms)
      },
    )
    mover.move(from, to)
    // The first rename (the replaced directory to its backup) failed once, then went through.
    expect(calls.filter(([a]) => a === to)).toHaveLength(2)
    expect(calls).toHaveLength(3)
    expect(delays).toEqual([100])
    expect(readFileSync(path.join(to, 'f.txt'), 'utf8')).toBe('new')
    expect(mover.rollback()).toBeNull()
    expect(readFileSync(path.join(to, 'old.txt'), 'utf8')).toBe('old')
  })

  test('a transient EPERM on the final rename into a free target is retried', () => {
    const { staging, from, to } = layout()
    removeTree(to)
    const delays: number[] = []
    let failed = false
    const mover = new Mover(
      staging,
      (a, b) => {
        if (a === from && !failed) {
          failed = true
          throw codeError('EPERM')
        }
        renameSync(a, b)
      },
      (ms) => {
        delays.push(ms)
      },
    )
    mover.move(from, to)
    expect(failed).toBe(true)
    expect(delays).toEqual([100])
    expect(readFileSync(path.join(to, 'f.txt'), 'utf8')).toBe('new')
    expect(mover.rollback()).toBeNull()
  })

  test('a rename that keeps failing with EPERM is tried five times, then rethrown unchanged', () => {
    const { staging, from, to } = layout()
    const original = codeError('EPERM')
    const delays: number[] = []
    let calls = 0
    const mover = new Mover(
      staging,
      () => {
        calls += 1
        throw original
      },
      (ms) => {
        delays.push(ms)
      },
    )
    expect(() => mover.move(from, to)).toThrow(original)
    expect(calls).toBe(5)
    expect(delays).toEqual([100, 200, 300, 400])
  })

  test('an error that is not a transient lock is not retried', () => {
    const { staging, from, to } = layout()
    const delays: number[] = []
    let calls = 0
    const mover = new Mover(
      staging,
      () => {
        calls += 1
        throw codeError('ENOENT')
      },
      (ms) => {
        delays.push(ms)
      },
    )
    expect(() => mover.move(from, to)).toThrow('ENOENT')
    expect(calls).toBe(1)
    expect(delays).toEqual([])
  })
})

describe('generate: compose and the reserved server selection', () => {
  const only = (out: string, template: string) =>
    resolveRequest(catalog, request(out, { stack: undefined, template, skipPostGenerate: true }))
  const composeOf = (out: string) =>
    parse(readFileSync(path.join(out, 'docker-compose.yml'), 'utf8'))

  test('a lone frontend has no depends_on and no API_URL', () => {
    const out = tempDir()
    generate(catalog, only(out, 'frontend/mini-ui'))
    const frontend = composeOf(out).services.frontend
    expect(frontend.depends_on).toBeUndefined()
    expect(frontend.environment?.API_URL).toBeUndefined()
  })

  test('a frontend in a stack with a server keeps both lines', () => {
    const out = tempDir()
    generate(catalog, resolveRequest(catalog, request(out)))
    const frontend = composeOf(out).services.frontend
    expect(frontend.depends_on).toEqual(['backend'])
    expect(frontend.environment.API_URL).toBe('http://backend:4000')
  })

  test('a rerun adds the missing service to the existing compose file', () => {
    const out = tempDir()
    generate(catalog, only(out, 'server/mini'))
    const file = path.join(out, 'docker-compose.yml')
    writeFileSync(file, readFileSync(file, 'utf8') + '# added by hand\n')
    generate(catalog, only(out, 'frontend/mini-ui'))
    const text = readFileSync(file, 'utf8')
    const compose = parse(text)
    expect(Object.keys(compose.services).sort()).toEqual(['backend', 'frontend'])
    expect(compose.services.frontend.depends_on).toBeUndefined()
    expect(text).toContain('# added by hand')
  })

  test('services already in the compose file are kept and logged', () => {
    const out = tempDir()
    generate(catalog, only(out, 'server/mini'))
    const before = readFileSync(path.join(out, 'docker-compose.yml'), 'utf8')
    removeTree(path.join(out, 'backend'))
    const lines: string[] = []
    generate(catalog, only(out, 'server/mini'), { log: (l) => lines.push(l) })
    expect(readFileSync(path.join(out, 'docker-compose.yml'), 'utf8')).toBe(before)
    expect(lines).toContain('docker-compose.yml already has service backend; kept')
  })
})

describe('generate with a capability', () => {
  const fake = (out: string, extra = {}) =>
    resolveRequest(catalog, request(out, { capabilities: ['database=fake'], ...extra }))
  const read = (out: string, ...parts: string[]) => readFileSync(path.join(out, ...parts), 'utf8')

  test('copies the overlay over the base and writes the scripts', () => {
    const out = tempDir()
    generate(catalog, fake(out))
    expect(read(out, 'backend', 'src', 'index.ts')).toBe("export const app = 'app-with-database'\n")
    expect(existsSync(path.join(out, 'backend', 'src', 'database.ts'))).toBe(true)
    const pkg = JSON.parse(read(out, 'backend', 'package.json'))
    expect(pkg.scripts).toEqual({ 'test:db': 'bun ./ok.ts', 'db:migrate': 'bun ./ok.ts' })
  })

  test('appends the provider block to a new .env.example', () => {
    const out = tempDir()
    generate(catalog, fake(out))
    expect(read(out, 'backend', '.env.example')).toBe(
      [
        '# database/fake provider',
        '# Connection string of the fake database',
        '# Tests (testDb) use fake://localhost:5432/app_test; override with TEST_DATABASE_URL.',
        'DATABASE_URL=fake://localhost:5432/app',
        '',
        '# database/fake provider',
        '# Connections the fake database keeps open',
        '# Tests (testDb) use 2.',
        'FAKE_POOL_SIZE=5',
        '',
      ].join('\n'),
    )
  })

  test('appends to an existing .env.example keeping its line endings', () => {
    const root = copyFixture('catalog')
    writeFileSync(path.join(root, 'server/mini/base/.env.example'), 'PORT=4000\r\n')
    const out = tempDir()
    const local = loadCatalog(root)
    generate(local, resolveRequest(local, request(out, { capabilities: ['database=fake'] })))
    const text = read(out, 'backend', '.env.example')
    expect(text.startsWith('PORT=4000\r\n\r\n# database/fake provider\r\n')).toBe(true)
    expect(text.replaceAll('\r\n', '')).not.toContain('\n')
    expect(text.endsWith('FAKE_POOL_SIZE=5\r\n')).toBe(true)
  })

  test('assembles the provider service, the volume, the env and the dependency', () => {
    const out = tempDir()
    generate(catalog, fake(out))
    const compose = parse(read(out, 'docker-compose.yml'))
    expect(compose.services.database.image).toBe('fake-db:1')
    expect(compose.volumes).toEqual({ 'database-data': {} })
    // a secret entry has no default; a plain one keeps its compose-network value
    expect(compose.services.backend.environment.DATABASE_URL).toBe('${DATABASE_URL}')
    expect(compose.services.backend.environment.FAKE_POOL_SIZE).toBe('${FAKE_POOL_SIZE:-5}')
    expect(compose.services.backend.depends_on).toEqual({
      database: { condition: 'service_healthy' },
    })
    expect(compose.services.frontend.environment.DATABASE_URL).toBeUndefined()
  })

  test('copies the provider files to the project root', () => {
    const out = tempDir()
    generate(catalog, fake(out))
    expect(read(out, 'db', 'init.sql')).toBe('-- fake database init\n')
  })

  test('records capabilities, commands and providers in the provenance', () => {
    const out = tempDir()
    generate(catalog, fake(out))
    const provenance = parse(read(out, '.fullstack', 'catalog.yaml'))
    expect(provenance.packages.backend.capabilities).toEqual({ database: 'fake' })
    expect(provenance.packages.backend.commands.testDb).toBe('bun run test:db')
    expect(provenance.packages.backend.commands.migrate).toBe('bun run db:migrate')
    expect(provenance.packages.frontend.capabilities).toEqual({})
    expect(provenance.providers).toEqual({ database: 'fake' })
    expect(validateAgainst('provenance', provenance)).toEqual([])
  })

  test('runs the post-generate commands the plan resolved', () => {
    const out = tempDir()
    const lines: string[] = []
    generate(catalog, fake(out, { skipPostGenerate: false }), { log: (l) => lines.push(l) })
    expect(lines.some((l) => l.startsWith('==> backend: '))).toBe(true)
  })

  test('a rerun adding a package keeps the existing provider file and service', () => {
    const out = tempDir()
    const only = (template: string, extra = {}) =>
      resolveRequest(catalog, request(out, { stack: undefined, template, ...extra }))
    generate(catalog, only('server/mini', { capabilities: ['database=fake'] }))
    writeFileSync(path.join(out, 'db', 'init.sql'), '-- edited\n')
    const lines: string[] = []
    generate(catalog, only('frontend/mini-ui'), { log: (l) => lines.push(l) })
    expect(read(out, 'db', 'init.sql')).toBe('-- edited\n')
    expect(parse(read(out, '.fullstack', 'catalog.yaml')).providers).toEqual({ database: 'fake' })

    const again = tempDir()
    generate(catalog, only('frontend/mini-ui', { out: again }))
    generate(catalog, only('server/mini', { out: again, capabilities: ['database=fake'] }))
    expect(existsSync(path.join(again, 'db', 'init.sql'))).toBe(true)
  })

  test('logs the provider file it keeps when the project already has it', () => {
    const out = tempDir()
    mkdirSync(path.join(out, 'db'))
    writeFileSync(path.join(out, 'db', 'init.sql'), '-- mine\n')
    const lines: string[] = []
    generate(catalog, fake(out), { log: (l) => lines.push(l) })
    expect(read(out, 'db', 'init.sql')).toBe('-- mine\n')
    expect(lines).toContain(`db/init.sql already exists in ${out}; kept`)
  })

  test('a rerun keeps the provider service already in docker-compose.yml', () => {
    const out = tempDir()
    generate(catalog, fake(out))
    const file = path.join(out, 'docker-compose.yml')
    writeFileSync(file, readFileSync(file, 'utf8').replace('fake-db:1', 'edited:2'))
    const lines: string[] = []
    generate(
      catalog,
      resolveRequest(
        catalog,
        request(out, {
          stack: undefined,
          template: 'server/mini',
          dir: 'api',
          capabilities: ['database=fake'],
        }),
      ),
      { log: (l) => lines.push(l) },
    )
    expect(parse(read(out, 'docker-compose.yml')).services.database.image).toBe('edited:2')
    expect(lines).toContain('docker-compose.yml already has service database; kept')
    expect(lines).toContain('db/init.sql already exists in ' + out + '; kept')
  })

  test('auth off still removes an overlay file under an onlyPaths entry', () => {
    const out = tempDir()
    generate(catalog, fake(out, { flags: ['auth=false'] }))
    expect(existsSync(path.join(out, 'backend', 'src', 'auth.ts'))).toBe(false)
    expect(existsSync(path.join(out, 'backend', 'src', 'database.ts'))).toBe(true)
    const withAuth = tempDir()
    generate(catalog, fake(withAuth))
    expect(read(withAuth, 'backend', 'src', 'auth.ts')).toContain('auth-with-database')
  })

  test('a capability flag onlyPath exists only while the flag is on', () => {
    const off = tempDir()
    generate(catalog, fake(off, { flags: ['auth=false'] }))
    expect(existsSync(path.join(off, 'backend', 'src', 'auth-database.ts'))).toBe(false)
    const on = tempDir()
    generate(catalog, fake(on))
    expect(read(on, 'backend', 'src', 'auth-database.ts')).toContain('auth-only-overlay')
  })

  test('a capability flag onlyPath missing after the overlay copy fails and names the path', () => {
    const root = copyFixture('catalog')
    const broken = loadCatalog(root)
    rmSync(path.join(root, 'server/mini/capabilities/database/fake/overlay/src/auth-database.ts'))
    const options = { capabilities: ['database=fake'], flags: ['auth=false'] }
    expect(() => generate(broken, resolveRequest(broken, request(tempDir(), options)))).toThrow(
      'src/auth-database.ts',
    )
  })

  test('a generation without capabilities has no provider, scripts or env block', () => {
    const out = tempDir()
    generate(catalog, resolveRequest(catalog, request(out)))
    expect(existsSync(path.join(out, 'db'))).toBe(false)
    expect(existsSync(path.join(out, 'backend', '.env.example'))).toBe(false)
    expect(JSON.parse(read(out, 'backend', 'package.json')).scripts).toBeUndefined()
    const compose = parse(read(out, 'docker-compose.yml'))
    expect(compose.services.database).toBeUndefined()
    expect(compose.volumes).toBeUndefined()
    expect(compose.services.backend.depends_on).toBeUndefined()
    const provenance = parse(read(out, '.fullstack', 'catalog.yaml'))
    expect(provenance.providers).toEqual({})
    expect(provenance.packages.backend.capabilities).toEqual({})
  })
})

describe('generate: drop after post-generate', () => {
  const codeError = (code: string) => Object.assign(new Error(`${code}: rm`), { code })

  // mini whose install writes what it saw and builds a cache directory next to a file that stays.
  function droppingCatalog() {
    const root = copyFixture('catalog')
    const template = path.join(root, 'server/mini/template.yaml')
    edit(template, 'install: bun ./ok.ts', 'install: bun ./build.ts')
    edit(
      template,
      'postGenerate: [install, contract]',
      'postGenerate: [install, contract]\ndropAfterPostGenerate: [cache, nothing/here]',
    )
    writeFileSync(
      path.join(root, 'server/mini/base/build.ts'),
      [
        "import { mkdirSync, writeFileSync } from 'node:fs'",
        "mkdirSync('cache', { recursive: true })",
        "writeFileSync('cache/built.txt', 'x')",
        "writeFileSync('seen.txt', process.env.PYTHONDONTWRITEBYTECODE ?? 'unset')",
        '',
      ].join('\n'),
    )
    mkdirSync(path.join(root, 'server/mini/base/cache'))
    writeFileSync(path.join(root, 'server/mini/base/cache/keep.txt'), 'x')
    return loadCatalog(root)
  }
  const only = (cat: typeof catalog, out: string, extra = {}) =>
    resolveRequest(cat, request(out, { stack: undefined, template: 'server/mini', ...extra }))

  test('removes the listed paths from the output and tolerates a missing one', () => {
    const cat = droppingCatalog()
    const out = tempDir()
    generate(cat, only(cat, out, { skipPostGenerate: false }))
    expect(existsSync(path.join(out, 'backend', 'cache'))).toBe(false)
    expect(existsSync(path.join(out, 'backend', 'seen.txt'))).toBe(true)
  })

  test('post-generate commands see PYTHONDONTWRITEBYTECODE=1', () => {
    const cat = droppingCatalog()
    const out = tempDir()
    generate(cat, only(cat, out, { skipPostGenerate: false }))
    expect(readFileSync(path.join(out, 'backend', 'seen.txt'), 'utf8')).toBe('1')
  })

  test('a transient EBUSY on removal is retried with growing delays, then succeeds', () => {
    const cat = droppingCatalog()
    const out = tempDir()
    let calls = 0
    const delays: number[] = []
    generate(cat, only(cat, out, { skipPostGenerate: false }), {
      remove: (target) => {
        calls += 1
        if (calls <= 2) throw codeError('EBUSY')
        removeTree(target)
      },
      sleep: (ms) => delays.push(ms),
    })
    expect(calls).toBeGreaterThanOrEqual(3)
    expect(delays.slice(0, 2)).toEqual([100, 200])
    expect(existsSync(path.join(out, 'backend', 'cache'))).toBe(false)
  })

  test('a removal that keeps failing fails the generation and leaves the target untouched', () => {
    const cat = droppingCatalog()
    const out = tempDir()
    expect(() =>
      generate(cat, only(cat, out, { skipPostGenerate: false }), {
        remove: () => {
          throw codeError('EPERM')
        },
        sleep: () => undefined,
      }),
    ).toThrow('EPERM')
    expect(existsSync(path.join(out, 'backend'))).toBe(false)
  })

  test('a non-transient removal error is not retried', () => {
    const cat = droppingCatalog()
    let calls = 0
    expect(() =>
      generate(cat, only(cat, tempDir(), { skipPostGenerate: false }), {
        remove: () => {
          calls += 1
          throw codeError('ENOENT')
        },
        sleep: () => undefined,
      }),
    ).toThrow('ENOENT')
    expect(calls).toBe(1)
  })

  test('nothing is dropped when post-generate is skipped', () => {
    const cat = droppingCatalog()
    const out = tempDir()
    generate(cat, only(cat, out, { skipPostGenerate: true }), {
      remove: () => {
        throw new Error('must not be called')
      },
    })
    expect(existsSync(path.join(out, 'backend', 'cache', 'keep.txt'))).toBe(true)
    expect(existsSync(path.join(out, 'backend', 'seen.txt'))).toBe(false)
  })
})

describe('generate with a capability that declares container.migrate', () => {
  function migrateCatalog() {
    const root = copyFixture('catalog')
    appendFileSync(
      path.join(root, 'server/mini/capabilities/database/fake/capability.yaml'),
      'container:\n  migrate: bun ./ok.ts\n',
    )
    return loadCatalog(root)
  }
  const fakeRequest = (cat: ReturnType<typeof loadCatalog>, out: string) =>
    resolveRequest(cat, request(out, { capabilities: ['database=fake'] }))
  const compose = (out: string) => readFileSync(path.join(out, 'docker-compose.yml'), 'utf8')

  test('writes the derived one-shot service and the dependency on it', () => {
    const cat = migrateCatalog()
    const out = tempDir()
    generate(cat, fakeRequest(cat, out))
    const { services } = parse(compose(out))
    expect(services['backend-migrate']).toEqual({
      build: './backend',
      environment: services.backend.environment,
      command: 'bun ./ok.ts',
      restart: 'no',
      profiles: ['app'],
      depends_on: { database: { condition: 'service_healthy' } },
    })
    expect(services.backend.depends_on['backend-migrate']).toEqual({
      condition: 'service_completed_successfully',
    })
    expect(services.backend.depends_on.database).toEqual({ condition: 'service_healthy' })
  })

  test('adds nothing without the capability', () => {
    const cat = migrateCatalog()
    const out = tempDir()
    generate(cat, resolveRequest(cat, request(out)))
    expect(Object.keys(parse(compose(out)).services)).toEqual(['backend', 'frontend'])
  })

  test('a rerun keeps the service in the file and does not duplicate it', () => {
    const cat = migrateCatalog()
    const out = tempDir()
    generate(cat, fakeRequest(cat, out))
    const file = path.join(out, 'docker-compose.yml')
    const doc = parseDocument(compose(out))
    doc.setIn(['services', 'backend-migrate', 'command'], 'edited by hand')
    doc.deleteIn(['services', 'backend'])
    writeFileSync(file, doc.toString())
    removeTree(path.join(out, 'backend'))
    const lines: string[] = []
    generate(
      cat,
      resolveRequest(
        cat,
        request(out, {
          stack: undefined,
          template: 'server/mini',
          capabilities: ['database=fake'],
        }),
      ),
      { log: (l) => lines.push(l) },
    )
    const text = compose(out)
    expect(text.match(/^ {2}backend-migrate:/gm)).toHaveLength(1)
    expect(parse(text).services['backend-migrate'].command).toBe('edited by hand')
    expect(lines).toContain('docker-compose.yml already has service backend-migrate; kept')
  })
})
