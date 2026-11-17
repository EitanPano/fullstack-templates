// The contract: openapi.json is produced from the zod schemas that validate requests, and the
// committed file must match them (run `bun run openapi` when it does not).
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { describe, expect, it } from 'vitest'

import { buildOpenApiDocument, registrations } from '../../server/openapi'

const root = path.resolve(import.meta.dirname, '../..')

describe('openapi.json', () => {
  it('matches the schemas (run `bun run openapi` when this fails)', () => {
    const committed: unknown = JSON.parse(readFileSync(path.join(root, 'openapi.json'), 'utf8'))

    expect(committed).toEqual(buildOpenApiDocument())
  })

  it('is OpenAPI 3.1 and served from the origin root', () => {
    const doc = buildOpenApiDocument()

    expect(doc.openapi).toBe('3.1.0')
    expect(doc.servers).toEqual([{ url: '/' }])
  })

  it('documents the health endpoint and the error envelope', () => {
    const doc = buildOpenApiDocument()

    expect(doc.paths?.['/api/health']?.get?.responses?.['200']).toBeDefined()
    expect(doc.components?.schemas?.ErrorBody).toBeDefined()
  })

  it('documents readiness with its 200 and 503 bodies', () => {
    const responses = buildOpenApiDocument().paths?.['/api/health/ready']?.get?.responses

    expect(responses?.['200']).toBeDefined()
    expect(responses?.['503']).toBeDefined()
  })

  it('documents the reference module with a tag and the error envelope on its failures', () => {
    const doc = buildOpenApiDocument()
    const create = doc.paths?.['/api/module']?.post

    expect(create?.tags).toEqual(['module'])
    expect(create?.responses?.['400']).toBeDefined()
    expect(doc.components?.schemas?.Module).toBeDefined()
    expect(doc.components?.schemas?.ModulePage).toBeDefined()
    expect(doc.paths?.['/api/module/{id}']?.delete?.responses?.['204']).toBeDefined()
  })

  it('registers at least one path for every module in the list', () => {
    expect(registrations.length).toBeGreaterThan(0)
    for (const register of registrations) {
      const registry = new OpenAPIRegistry()
      register(registry)

      expect(registry.definitions.some((d) => d.type === 'route')).toBe(true)
    }
  })

  // Pages routes by file path: a documented route with no route file is a contract that lies.
  it('has a route file that handles every documented operation', () => {
    for (const register of registrations) {
      const registry = new OpenAPIRegistry()
      register(registry)
      for (const definition of registry.definitions) {
        if (definition.type !== 'route') continue
        const { method, path: route } = definition.route
        const segments = route.replace(/^\//, '').replace(/\{(\w+)\}/g, '[$1]')
        const file = [`functions/${segments}.ts`, `functions/${segments}/index.ts`].find((c) =>
          existsSync(path.join(root, c)),
        )
        expect(file, `no route file for ${method} ${route}`).toBeDefined()
        const handler = `onRequest${method[0]?.toUpperCase() ?? ''}${method.slice(1)}`
        expect(readFileSync(path.join(root, file ?? ''), 'utf8')).toContain(`export const ${handler}`)
      }
    }
  })

  it('has no documented path outside /api', () => {
    for (const route of Object.keys(buildOpenApiDocument().paths ?? {})) {
      expect(route.startsWith('/api/')).toBe(true)
    }
  })
})

describe('the openapi script', () => {
  it('only runs: it does not rely on import.meta.main', () => {
    const source = readFileSync(path.join(root, 'scripts/openapi.ts'), 'utf8')
    const script = source
      .split('\n')
      .filter((line) => !line.startsWith('//'))
      .join('\n')

    expect(script).not.toContain('import.meta.main')
    expect(script).toContain('openapi.json')
  })
})
