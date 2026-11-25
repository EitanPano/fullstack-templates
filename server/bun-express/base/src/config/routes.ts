// The mount table: one line per API entity, in mount order. This is the only file that imports
// an entity's routes.ts (api/admin/routes.ts imports the admin entities' own), and only server.ts
// and tests import this file (both are lint zones). Adding an entity is a line here and its
// OpenAPI registration in openapi.ts, then running `bun run openapi`; an admin entity is a line
// in api/admin/routes.ts instead.
import type { Express } from 'express'

import adminRoutes from '../api/admin/routes'
import healthRoutes from '../api/health/routes'
import sdkRoutes from '../api/sdk/routes' // @sdk
import authRoutes from '../api/auth/routes' // @auth
import entityRoutes from '../api/entity/routes'
import userRoutes from '../api/user/routes' // @auth

export function registerRoutes(app: Express): void {
  app.use('/api/health', healthRoutes)
  app.use('/api/auth', authRoutes) // @auth
  app.use('/api/user', userRoutes) // @auth
  app.use('/api/entity', entityRoutes)
  app.use('/api/admin', adminRoutes)
  app.use('/api/sdk/v1', sdkRoutes) // @sdk
}
