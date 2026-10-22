import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { loadCatalog } from '../lib/catalog'
import { GenerateError, STAGING_DIR, generate } from '../lib/generate'
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
