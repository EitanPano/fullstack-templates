// server.ts belongs: the app, assembled in one place and only mounting: the root app (the
// middleware every /api response passes through), each module's router at /api/<name>, the admin
// namespace with its gate, the not_found envelope for any other /api path, and the hand-off of
// every path outside /api to the platform's assets (frontend-host.ts). Nothing here listens or
// touches a binding: index.ts is the Worker's export, and a test calls `app.fetch`.
// It does not belong: an endpoint (a module's routes.ts) or a gate (middleware/).
import adminRoutes from './api/admin/routes'
import healthRoutes from './api/health/routes'
import moduleRoutes from './api/module/routes'
import { frontendPages } from './middleware/frontend-host'
import { notFound, rootApp } from './middleware/handler'

export const app = rootApp()

// One line per module.
app.route('/api/health', healthRoutes)
app.route('/api/module', moduleRoutes)
app.route('/api/admin', adminRoutes)

app.all('/api/*', notFound)

// Not an API path: the built site. Beside one frontend, with `run_worker_first: ["/api/*"]`, a
// page never reaches the Worker; this answers only when something else does, and hands the
// request over untouched. Beside several, every request does (frontend-host.ts).
app.all('*', frontendPages)
