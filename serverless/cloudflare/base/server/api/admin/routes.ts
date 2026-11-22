// routes.ts belongs: the admin namespace's router, mounted at /api/admin by server/server.ts. It
// puts the namespace's gate first, then mounts each admin module's router (one line each).
// It does not belong: an endpoint, a rule or a query (the module's own files), or a second gate.
//
// `admin` is a namespace, not an entity: a module is `api/admin/<entity>/` (copy `api/module/`),
// its paths are `/api/admin/<entity>`, and its router is mounted here:
//   routes.route('/lead', leadRoutes)
// The gate is on the namespace, so a route inside it cannot ship without it. An unknown path under
// it is the `not_found` envelope for a caller the gate admits.
import { Hono } from 'hono'

import { adminGate } from '../../middleware/admin-gate'
import { adminHost } from '../../middleware/frontend-host' // @frontends
import { guard, type AppEnv } from '../../middleware/handler'

const routes = new Hono<AppEnv>()

routes.use('*', guard(adminHost)) // @frontends
routes.use('*', guard(adminGate))

export default routes
