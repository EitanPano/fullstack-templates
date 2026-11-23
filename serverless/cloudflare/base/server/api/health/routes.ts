// routes.ts belongs: this entity's router, mounted at /api/health by server/server.ts. Each endpoint
// is one line: its gate chain and the call to its controller; a path also answers 405 for the
// methods it does not register.
// It does not belong: logic (controller.ts) or schemas (schema.ts).
import { Hono } from 'hono'

import { handle, methodNotAllowed, type AppEnv } from '../../middleware/handler'
import { getHealth, getReadiness } from './controller'

const routes = new Hono<AppEnv>()

routes.get('/', handle(getHealth))
routes.all('/', methodNotAllowed('GET'))
routes.get('/ready', handle(getReadiness))
routes.all('/ready', methodNotAllowed('GET'))

export default routes
