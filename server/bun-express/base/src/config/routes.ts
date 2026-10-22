// The mount table: one line per API module, in mount order. This is the only file that imports
// a module's routes.ts, and only server.ts and tests import this file (both are lint zones).
// Adding a module is a line here and its OpenAPI registration in openapi.ts, then running
// `bun run openapi`.
import type { Express } from 'express'

import healthRoutes from '../api/health/routes'
import authRoutes from '../api/auth/routes' // @auth
import moduleRoutes from '../api/module/routes'
import userRoutes from '../api/user/routes' // @auth

export function registerRoutes(app: Express): void {
  app.use('/api/health', healthRoutes)
  app.use('/api/auth', authRoutes) // @auth
  app.use('/api/user', userRoutes) // @auth
  app.use('/api/module', moduleRoutes)
}
