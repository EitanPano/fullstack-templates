// routes.ts belongs: this directory's router, one line per endpoint. The gate and the frame-only
// guard are on the namespace (api/sdk/routes.ts), so none is repeated here.
// It does not belong: request handling (controller.ts) or schemas (schema.ts).
import { Hono } from 'hono'

import { handle, methodNotAllowed, type AppEnv } from '../../../middleware/handler'
import { validate } from '../../../middleware/validate'
import { postSdkTelemetry } from './controller'
import { postSdkTelemetryRequest } from './schema'

const routes = new Hono<AppEnv>()

routes.post('/', handle(validate(postSdkTelemetryRequest), postSdkTelemetry))
routes.all('/', methodNotAllowed('POST'))

export default routes
