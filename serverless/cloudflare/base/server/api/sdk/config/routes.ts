// routes.ts belongs: this directory's router, one line per endpoint. The gate is on the
// namespace (api/sdk/routes.ts), so none is repeated here.
// It does not belong: request handling (controller.ts) or schemas (schema.ts).
import { Hono } from 'hono'

import { handle, methodNotAllowed, type AppEnv } from '../../../middleware/handler'
import { getSdkConfig } from './controller'

const routes = new Hono<AppEnv>()

routes.get('/', handle(getSdkConfig))
routes.all('/', methodNotAllowed('GET'))

export default routes
