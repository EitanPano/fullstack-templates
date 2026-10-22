import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { OpenApiGeneratorV31, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'

import pkg from '../package.json' with { type: 'json' }
import { registerHealth } from './api/health/schema'
import { registerAuth } from './api/auth/schema' // @auth
import { registerModule } from './api/module/schema'
import { registerUser } from './api/user/schema' // @auth

// Builds the contract from the zod schemas. Every module registers its endpoints in its
// schema.ts; the list below names each registration once, in the mount order of
// config/routes.ts. `bun run openapi` writes openapi.json, which the frontend's
// `bun run api:types` consumes. A test fails when the committed file is stale.
export const registrations: readonly ((registry: OpenAPIRegistry) => void)[] = [
  registerHealth,
  registerAuth, // @auth
  registerUser, // @auth
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

if (import.meta.main && process.argv.includes('--write')) {
  const target = fileURLToPath(new URL('../openapi.json', import.meta.url))
  writeFileSync(target, `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`)
  console.log('wrote openapi.json')
}
