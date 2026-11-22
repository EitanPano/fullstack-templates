// openapi.ts belongs: building the OpenAPI document from the zod schemas. Every module registers
// its endpoints in its schema.ts; the list below names each registration once, in the order of the
// routes. `bun run openapi` (scripts/openapi.ts) writes openapi.json, which a frontend's contract
// command consumes; a unit test fails when the committed file is stale.
// It does not belong: any import the request path needs (no entry or routes.ts imports this file)
// or any binding: it runs in Bun outside the runtime.
import { OpenApiGeneratorV31, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'

import pkg from '../package.json' with { type: 'json' }
import { registerHealth } from './api/health/schema'
import { registerModule } from './api/module/schema'

export const registrations: readonly ((registry: OpenAPIRegistry) => void)[] = [
  registerHealth,
  registerModule,
]

export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry()
  for (const register of registrations) register(registry)
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: '__PROJECT_NAME__ API', version: pkg.version },
    servers: [{ url: '/' }],
  })
}
