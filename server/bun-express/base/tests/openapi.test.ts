import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import request from 'supertest'

import { modules } from '../src/config/routes'
import { buildOpenApiDocument } from '../src/openapi'
import { app } from '../src/server'

describe('openapi.json', () => {
  it('matches the schemas (run `bun run openapi` when this fails)', () => {
    const committed: unknown = JSON.parse(
      readFileSync(fileURLToPath(new URL('../openapi.json', import.meta.url)), 'utf8'),
    )

    expect(committed).toEqual(buildOpenApiDocument())
  })

  it('documents the health endpoint and the error envelope', () => {
    const doc = buildOpenApiDocument()

    expect(doc.paths?.['/api/health']?.get?.responses?.['200']).toBeDefined()
    expect(doc.components?.schemas?.ErrorBody).toBeDefined()
  })

  it('documents readiness with its 200 and 503 bodies', () => {
    const doc = buildOpenApiDocument()
    const responses = doc.paths?.['/api/health/ready']?.get?.responses

    expect(responses?.['200']).toBeDefined()
    expect(responses?.['503']).toBeDefined()
    expect(doc.components?.schemas?.Readiness).toBeDefined()
  })

  it('registers at least one path for every module in the list', () => {
    for (const mod of modules) {
      const registry = new OpenAPIRegistry()
      mod.register(registry)

      expect(registry.definitions.some((d) => d.type === 'route')).toBe(true)
    }
  })

  it('mounts every module under /api: its first registered route is reachable', async () => {
    for (const mod of modules) {
      const registry = new OpenAPIRegistry()
      mod.register(registry)
      const definition = registry.definitions.find((d) => d.type === 'route')
      if (definition?.type !== 'route') throw new Error(`no route registered for ${mod.path}`)
      const { method, path } = definition.route

      const res = await request(app)[method as 'get' | 'post' | 'put' | 'patch' | 'delete'](path)

      expect(res.status).not.toBe(404)
      expect(res.body).not.toMatchObject({ error: { code: 'not_found' } })
    }
  })

  it('still answers not_found for a path no module owns', async () => {
    const res = await request(app).get('/api/no-such-module')

    expect(res.status).toBe(404)
    expect(res.body).toMatchObject({ error: { code: 'not_found' } })
  })
})
