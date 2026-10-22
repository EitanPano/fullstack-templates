import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
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
    expect(values).toMatchObject({ SERVER_DIR: 'backend', SERVER_PORT: '4000', PORT: '3000' })
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
