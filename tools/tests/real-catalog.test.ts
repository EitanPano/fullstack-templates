import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { loadCatalog } from '../lib/catalog'
import { CATALOG_ROOT } from '../lib/cli'
import { removeTree } from '../lib/files'
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

  test('frontend/next alone keeps the default API server command', () => {
    generated({ template: 'frontend/next' }, (out) => {
      expect(existsSync(path.join(out, 'frontend', 'package.json'))).toBe(true)
      expect(existsSync(path.join(out, 'backend'))).toBe(false)
      expect(playwright(out)).toContain("command: 'bun run start'")
      expect(playwright(out)).toContain("cwd: '../backend'")
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
