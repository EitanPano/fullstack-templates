// routes.ts belongs: the SDK namespace's router, mounted at /api/sdk/v1 by server/server.ts. It
// applies the one gate first (CORS for this namespace, the key, the rate limit), then mounts each
// SDK entity's router (one line each).
// It does not belong: an endpoint, a rule or a query (the entity's own files), or a second gate.
//
// `sdk` is a namespace, not an entity: an entity is `api/sdk/<entity>/` (copy `api/sdk/config/`),
// its paths are `/api/sdk/v1/<entity>`, and its router is mounted here:
//   routes.route('/unit', unitRoutes)
// Within `v1` the namespace only adds: a new endpoint, a new optional request field or a new
// response field. A removal or a change is a `v2` beside it, mounted at /api/sdk/v2 by
// server/server.ts, while a build that calls `v1` is still in use. The loader and frame files
// (/api/sdk/dist, /api/sdk/frame) are not here: they carry no key (middleware/sdk-files.ts).
import { Hono } from 'hono'

import { namespaceGuard, type AppEnv } from '../../middleware/handler'
import { sdkGate, sdkHeaders } from '../../middleware/sdk-gate'
import configRoutes from './config/routes'

const routes = new Hono<AppEnv>()

routes.use('*', namespaceGuard(sdkHeaders, ...sdkGate))

routes.route('/config', configRoutes)

export default routes
