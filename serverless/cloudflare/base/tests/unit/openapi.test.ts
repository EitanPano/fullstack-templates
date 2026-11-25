// The contract: openapi.json is produced from the zod schemas that validate requests, and the
// committed file must match them (run `bun run openapi` when it does not).
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { describe, expect, it } from 'vitest'

import { buildOpenApiDocument, registrations } from '../../server/openapi'
import { app } from '../../server/server'

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

  it('documents the reference entity with a tag and the error envelope on its failures', () => {
    const doc = buildOpenApiDocument()
    const create = doc.paths?.['/api/entity']?.post

    expect(create?.tags).toEqual(['entity'])
    expect(create?.responses?.['400']).toBeDefined()
    expect(doc.components?.schemas?.Entity).toBeDefined()
    expect(doc.components?.schemas?.EntityPage).toBeDefined()
    expect(doc.paths?.['/api/entity/{id}']?.delete?.responses?.['204']).toBeDefined()
  })

  // @sdk-start
  it('documents the SDK config endpoint with its key header and the 403 and 429 answers', () => {
    const doc = buildOpenApiDocument()
    const operation = doc.paths?.['/api/sdk/v1/config']?.get

    expect(operation?.operationId).toBe('getSdkConfig')
    expect(operation?.responses?.['200']).toBeDefined()
    expect(operation?.responses?.['403']).toBeDefined()
    expect(operation?.responses?.['429']).toBeDefined()
    expect(operation?.parameters).toEqual([
      expect.objectContaining({ name: 'x-sdk-key', in: 'header', required: true }),
    ])
    expect(doc.components?.schemas?.SdkConfig).toBeDefined()
  })

  it('leaves the served files out of the document: they are not JSON', () => {
    const paths = Object.keys(buildOpenApiDocument().paths ?? {})

    expect(paths.filter((path) => path.startsWith('/api/sdk/'))).toEqual(['/api/sdk/v1/config'])
  })

  // @sdk-end
  it('registers at least one path for every entity in the list', () => {
    expect(registrations.length).toBeGreaterThan(0)
    for (const register of registrations) {
      const registry = new OpenAPIRegistry()
      register(registry)

      expect(registry.definitions.some((d) => d.type === 'route')).toBe(true)
    }
  })

  // A documented operation with no route mounted is a contract that lies.
  it('mounts a route for every documented operation', () => {
    const mounted = new Set(app.routes.map((route) => `${route.method} ${route.path}`))
    for (const register of registrations) {
      const registry = new OpenAPIRegistry()
      register(registry)
      for (const definition of registry.definitions) {
        if (definition.type !== 'route') continue
        const { method, path: route } = definition.route
        const honoPath = route.replace(/\{(\w+)\}/g, ':$1')
        expect(
          mounted.has(`${method.toUpperCase()} ${honoPath}`),
          `no route for ${method} ${route}`,
        ).toBe(true)
      }
    }
  })

  it('mounts the router of every entity that has one', () => {
    const source = readFileSync(path.join(root, 'server/server.ts'), 'utf8')
    const entities = readdirSync(path.join(root, 'server/api'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => existsSync(path.join(root, 'server/api', name, 'routes.ts')))
    expect(entities.length).toBeGreaterThan(0)
    for (const name of entities) {
      expect(source, `server.ts does not mount ${name}`).toContain(`app.route('/api/${name}'`) // @nosdk
      // @sdk-start
      expect(source, `server.ts does not mount ${name}`).toContain(
        `app.route('/api/${name === 'sdk' ? 'sdk/v1' : name}'`,
      )
      // @sdk-end
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
