// server.ts belongs: the app, assembled in one place and only mounting: the root app (the
// middleware every /api response passes through), each entity's router at /api/<name>, the admin
// namespace with its gate, the not_found envelope for any other /api path, and the hand-off of
// every path outside /api to the platform's assets (frontend-host.ts). Nothing here listens or
// touches a binding: index.ts is the Worker's export, and a test calls `app.fetch`.
// It does not belong: an endpoint (an entity's routes.ts) or a gate (middleware/).
import adminRoutes from './api/admin/routes'
import healthRoutes from './api/health/routes'
import entityRoutes from './api/entity/routes'
import sdkRoutes from './api/sdk/routes' // @sdk
import { frontendPages } from './middleware/frontend-host'
import { notFound, rootApp } from './middleware/handler'
import { sdkDist, sdkFrame } from './middleware/sdk-files' // @sdk

export const app = rootApp()

// One line per entity.
app.route('/api/health', healthRoutes)
app.route('/api/entity', entityRoutes)
app.route('/api/admin', adminRoutes)
// @sdk-start
app.route('/api/sdk/v1', sdkRoutes)

// The SDK's built files and its frame document, outside the key gate and never answered by a page.
app.on(['GET', 'HEAD'], '/api/sdk/dist/*', sdkDist)
app.on(['GET', 'HEAD'], '/api/sdk/frame/:version', sdkFrame)
// @sdk-end

app.all('/api/*', notFound)

// Not an API path: the built site. Beside one frontend, with `run_worker_first: ["/api/*"]`, a
// page never reaches the Worker; this answers only when something else does, and hands the
// request over untouched. Beside several, every request does (frontend-host.ts).
app.all('*', frontendPages)
