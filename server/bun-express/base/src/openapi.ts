import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { OpenApiGeneratorV31, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'

import pkg from '../package.json' with { type: 'json' }
import { registerRoutes } from './config/routes'

// Builds the contract from the zod schemas. Every module registers in its schema.ts; the list
// in config/routes.ts is the only place to add it. `bun run openapi` writes openapi.json, which
// the frontend's `bun run api:types` consumes. A test fails when the committed file is stale.
export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry()
  registerRoutes(registry)
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: '__PROJECT_NAME__ API', version: pkg.version },
    servers: [{ url: '/' }],
  })
}

if (import.meta.main && process.argv.includes('--write')) {
  const target = fileURLToPath(new URL('../openapi.json', import.meta.url))
  writeFileSync(target, `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`)
  console.log('wrote openapi.json')
}
