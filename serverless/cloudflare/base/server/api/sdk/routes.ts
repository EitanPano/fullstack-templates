// routes.ts belongs: the SDK namespace's router, mounted at /api/sdk/v1 by server/server.ts. It
// applies the one gate first (CORS for this namespace, the key, the rate limit), then mounts each
// SDK entity's router (one line each).
// It does not belong: an endpoint, a rule or a query (the entity's own files), or a second gate.
//
// `sdk` is a namespace, not an entity: an entity is `api/sdk/<entity>/` (copy `api/sdk/config/`),
// its paths are `/api/sdk/v1/<entity>`, and its router is mounted here:
//   routes.route('/<entity>', <entity>Routes)
// An entity only the frame calls (a write the host page must not make, such as `message`) is
// mounted behind `frameOnly` (middleware/sdk-gate.ts), which refuses what is not
// same-origin and answers a preflight with no allow header. The `/*` covers the entity's path and
// every path under it; without it only the exact path is guarded:
//   routes.use('/<entity>/*', frameOnly)
//   routes.route('/<entity>', <entity>Routes)
// An entity mounted without it is readable by the host page, so it never takes a write that
// counts. A write from the frame also takes a limit of its own on its route, beside the
// namespace's two (the telemetry entity has none).
// Within `v1` the namespace only adds: a new endpoint, a new optional request field or a new
// response field. A removal or a change is a `v2` beside it, mounted at /api/sdk/v2 by
// server/server.ts, while a build that calls `v1` is still in use. The loader and frame files
// (/api/sdk/dist, /api/sdk/frame) are not here: they carry no key (middleware/sdk-files.ts).
import { Hono } from 'hono'

import { namespaceGuard, type AppEnv } from '../../middleware/handler'
import { frameOnly, sdkGate, sdkHeaders } from '../../middleware/sdk-gate'
import configRoutes from './config/routes'
import telemetryRoutes from './telemetry/routes'

const routes = new Hono<AppEnv>()

routes.use('*', namespaceGuard(sdkHeaders, ...sdkGate))

routes.route('/config', configRoutes)

// Only the frame sends telemetry: the host page gets the 403 envelope and no allow header.
routes.use('/telemetry/*', frameOnly)
routes.route('/telemetry', telemetryRoutes)

export default routes
