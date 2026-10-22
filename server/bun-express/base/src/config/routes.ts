// The module list: one line per API module, in mount order. This is the only file that imports
// a module's route.ts, and only server.ts, openapi.ts and tests import this file (both are lint
// zones). Adding a module is adding a line here, then running `bun run openapi`.
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import type { Router } from 'express'

import { healthRoute } from '../api/health/route'
import { registerHealth } from '../api/health/schema'
import { authRoute } from '../api/auth/route' // @auth
import { registerAuth } from '../api/auth/schema' // @auth
import { moduleRoute } from '../api/module/route'
import { registerModule } from '../api/module/schema'
import { userRoute } from '../api/user/route' // @auth
import { registerUser } from '../api/user/schema' // @auth

export type ApiModule = {
  path: `/${string}`
  route: Router
  register: (registry: OpenAPIRegistry) => void
}

export const modules: readonly ApiModule[] = [
  { path: '/health', route: healthRoute, register: registerHealth },
  { path: '/auth', route: authRoute, register: registerAuth }, // @auth
  { path: '/user', route: userRoute, register: registerUser }, // @auth
  { path: '/module', route: moduleRoute, register: registerModule },
]

export function mountRoutes(api: Router): void {
  for (const { path, route } of modules) api.use(path, route)
}

export function registerRoutes(registry: OpenAPIRegistry): void {
  for (const mod of modules) mod.register(registry)
}
