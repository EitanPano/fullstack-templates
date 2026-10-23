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
      expect(playwright(out)).toContain("command: 'bun run dev'")
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
      expect(playwright(out)).toContain("command: 'bun run dev'")
    })
  })

  test('next-python-fastapi with Postgres wires the uv command, port 8000 and the migrate service', () => {
    generated({ stack: 'next-python-fastapi', capabilities: ['database=postgres'] }, (out) => {
      expect(playwright(out)).toContain("command: 'uv run python -m app.main --reload'")
      const recorded = parse(readFileSync(path.join(out, '.fullstack', 'catalog.yaml'), 'utf8'))
      expect(recorded.packages.backend.http.port).toBe(8000)
      expect(playwright(out)).toContain('http://localhost:8000/api/health')
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
      expect(playwright(out)).toContain("command: 'bun run dev'")
      expect(playwright(out)).toContain("cwd: '../backend'")
    })
  })
})
