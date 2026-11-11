import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { loadCatalog } from '../lib/catalog'
import { CATALOG_ROOT } from '../lib/cli'
import { listFiles, removeTree } from '../lib/files'
import { generate } from '../lib/generate'
import { resolveRequest } from '../lib/plan'
import { tempDir } from './helpers'

// The fixture catalog cannot tell whether the real templates, overlays and Compose fragments fit
// the machinery, so these tests generate from the repository's own catalog.
const catalog = loadCatalog(CATALOG_ROOT)

function generated(extra: Record<string, unknown>, check: (out: string) => void): void {
  const out = tempDir()
  try {
    const plan = resolveRequest(catalog, {
      out,
      name: 'Demo',
      flags: [],
      capabilities: [],
      skipPostGenerate: true,
      ...extra,
    })
    generate(catalog, plan)
    expect(existsSync(path.join(out, '.fullstack', 'catalog.yaml'))).toBe(true)
    check(out)
  } finally {
    removeTree(out)
  }
}

const composeOf = (out: string) => parse(readFileSync(path.join(out, 'docker-compose.yml'), 'utf8'))
const playwright = (out: string) =>
  readFileSync(path.join(out, 'frontend', 'playwright.config.ts'), 'utf8')

describe('generation from the real catalog', () => {
  test('next-bun-express has both packages and no migrate service', () => {
    generated({ stack: 'next-bun-express' }, (out) => {
      expect(existsSync(path.join(out, 'backend', 'package.json'))).toBe(true)
      expect(existsSync(path.join(out, 'frontend', 'package.json'))).toBe(true)
      expect(Object.keys(composeOf(out).services)).not.toContain('backend-migrate')
      expect(playwright(out)).toContain("command: 'bun run start'")
    })
  })

  test('next-bun-express with Postgres adds the backend-migrate service', () => {
    generated({ stack: 'next-bun-express', capabilities: ['database=postgres'] }, (out) => {
      const { services } = composeOf(out)
      expect(services['backend-migrate'].command).toBe('bun run src/infra/scripts/migrate.ts')
      expect(services['backend-migrate'].restart).toBe('no')
      expect(services.backend.depends_on['backend-migrate'].condition).toBe(
        'service_completed_successfully',
      )
      expect(playwright(out)).toContain("command: 'bun run db:e2e && bun run start'")
      expect(playwright(out)).toContain('app_e2e')
    })
  })

  test('next-python-fastapi with Postgres wires the uv command, port 8000 and the migrate service', () => {
    generated({ stack: 'next-python-fastapi', capabilities: ['database=postgres'] }, (out) => {
      expect(playwright(out)).toContain("command: 'uv run poe e2e-db && uv run python -m app.main'")
      const recorded = parse(readFileSync(path.join(out, '.fullstack', 'catalog.yaml'), 'utf8'))
      expect(recorded.packages.backend.http.port).toBe(8000)
      expect(playwright(out)).toContain('http://127.0.0.1:8000/api/health')
      const { services } = composeOf(out)
      expect(services.backend.ports).toEqual(['127.0.0.1:8000:8000'])
      expect(services['backend-migrate'].command).toBe('python -m app.infra.scripts.migrate')
      expect(services.backend.depends_on['backend-migrate'].condition).toBe(
        'service_completed_successfully',
      )
    })
  })

  // ADR 0011: a frontend alone has no server-coupled file, no SERVER_* value and no contract command.
  test('frontend/next alone generates without a server', () => {
    generated({ template: 'frontend/next' }, (out) => {
      const recorded = parse(readFileSync(path.join(out, '.fullstack', 'catalog.yaml'), 'utf8'))
      expect(recorded.packages.frontend.commands.contract).toBeUndefined()
      expect(existsSync(path.join(out, 'docker-compose.yml'))).toBe(false)
      expect(existsSync(path.join(out, 'frontend', 'src', 'shared', 'api'))).toBe(false)
      expect(existsSync(path.join(out, 'frontend', 'openapi-ts.config.ts'))).toBe(false)
      const manifest = readFileSync(path.join(out, 'frontend', 'package.json'), 'utf8')
      expect(manifest).not.toContain('api:types')
      expect(manifest).not.toContain('@hey-api')
      expect(playwright(out)).not.toMatch(/__SERVER_|api\/health/)
    })
  })
})

describe('deploy modes in the real catalog', () => {
  test('a Next stack is split and records it', () => {
    generated({ stack: 'next-python-fastapi' }, (out) => {
      const recorded = parse(readFileSync(path.join(out, '.fullstack', 'catalog.yaml'), 'utf8'))
      expect(recorded.deploy).toBe('split')
      const { services } = composeOf(out)
      expect(services.frontend.ports).toEqual(['3000:3000'])
      expect(services.backend.ports).toEqual(['127.0.0.1:8000:8000'])
      expect(services.backend.environment.TRUST_PROXY).toBe('${TRUST_PROXY:-1}')
    })
  })

  test('single is refused for Next, which declares no static', () => {
    expect(() =>
      resolveRequest(catalog, {
        out: tempDir(),
        name: 'Demo',
        stack: 'next-bun-express',
        flags: [],
        capabilities: [],
        skipPostGenerate: true,
        deploy: 'single',
      }),
    ).toThrow(/frontend\/next.*static/)
  })
})

// The safety properties of a generated e2e config: a fresh API, its database prepared before it
// starts, the browser-test database and never the development one. Add a frontend's stacks here
// when it adopts the same config.
// The API is the first web server; a frontend's own command (vite build && preview) may chain.
const apiCommand = (text: string) => /command: '([^']+)'/.exec(text)?.[1] ?? ''

const E2E_STACKS = [
  'next-bun-express',
  'next-python-fastapi',
  'react-bun-express',
  'react-python-fastapi',
]

describe.each(E2E_STACKS)('the generated e2e config of %s', (stack) => {
  test('with a database it prepares app_e2e before the API starts, and refuses another name', () => {
    generated({ stack, capabilities: ['database=postgres'] }, (out) => {
      const text = playwright(out)
      expect(apiCommand(text)).toMatch(/ && /)
      expect(text).toContain('/app_e2e')
      expect(text).toContain('e2eDatabaseUrl(process.env.E2E_DATABASE_URL')
      expect(text.match(/reuseExistingServer: false/g)).toHaveLength(2) // the API and the app
      expect(existsSync(path.join(out, 'frontend', 'scripts', 'e2e-database-url.ts'))).toBe(true)
    })
  })

  test('without a database it has no database URL, no chained command and no guard', () => {
    generated({ stack }, (out) => {
      const text = playwright(out)
      expect(text).not.toContain('app_e2e')
      expect(text).not.toContain('E2E_DATABASE_URL')
      expect(apiCommand(text)).not.toContain('&&')
      expect(text.match(/reuseExistingServer: false/g)).toHaveLength(2) // the API and the app
      expect(existsSync(path.join(out, 'frontend', 'scripts', 'e2e-database-url.ts'))).toBe(false)
    })
  })
})

describe('the generated .gitignore', () => {
  const ignore = (out: string) => readFileSync(path.join(out, '.gitignore'), 'utf8')
  const count = (text: string, line: string) => text.split(/\r?\n/).filter((l) => l === line).length

  test.each(['react-bun-express', 'react-python-fastapi'])(
    '%s has neither Next-only line',
    (stack) => {
      generated({ stack }, (out) => {
        expect(count(ignore(out), '.next/')).toBe(0)
        expect(count(ignore(out), 'next-env.d.ts')).toBe(0)
      })
    },
  )

  test.each(['next-bun-express', 'next-python-fastapi'])(
    '%s has each Next-only line exactly once',
    (stack) => {
      generated({ stack }, (out) => {
        expect(count(ignore(out), '.next/')).toBe(1)
        expect(count(ignore(out), 'next-env.d.ts')).toBe(1)
      })
    },
  )
})

// ADR 0011 D8: a frontend generated alone is a subset of the same frontend in its default stack,
// so the harness's three-way merge adds the server's part and never deletes or conflicts on a
// product file. Generating also trips the placeholder net, so a server-coupled file left in a
// lone tree fails here and not only in the case runner.
describe('a frontend alone is a subset of its default stack', () => {
  const frontends = catalog.index.templates.filter((entry) => entry.kind === 'frontend')

  test('the catalog lists the four frontends', () => {
    expect(frontends.length).toBeGreaterThan(0)
  })

  for (const entry of frontends) {
    test(`${entry.path}: every path exists in the stack, scripts and dependencies are a subset`, () => {
      const stackId = catalog.templates.get(entry.path)?.manifest.defaultStack
      expect(stackId).toBeDefined()
      const lone = tempDir()
      const stack = tempDir()
      try {
        const base = { name: 'Demo', flags: [], capabilities: [], skipPostGenerate: true }
        generate(catalog, resolveRequest(catalog, { ...base, out: lone, template: entry.path }))
        generate(catalog, resolveRequest(catalog, { ...base, out: stack, stack: stackId }))
        const loneDir = path.join(lone, 'frontend')
        const stackDir = path.join(stack, 'frontend')
        const missing = listFiles(loneDir)
          .map((file) => path.relative(loneDir, file))
          .filter((rel) => !existsSync(path.join(stackDir, rel)))
        expect(missing).toEqual([])
        const read = (dir: string) =>
          JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as Record<
            string,
            Record<string, string> | undefined
          >
        const [a, b] = [read(loneDir), read(stackDir)]
        for (const key of ['scripts', 'dependencies', 'devDependencies']) {
          const extra = Object.keys(a[key] ?? {}).filter((name) => b[key]?.[name] === undefined)
          expect({ key, extra }).toEqual({ key, extra: [] })
        }
      } finally {
        removeTree(lone)
        removeTree(stack)
      }
    }, 60_000)
  }
})
