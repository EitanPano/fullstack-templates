// routes.ts belongs: this directory's router, one line per endpoint. The gate and the frame-only
// guard are on the mount (api/sdk/routes.ts), so none is repeated here.
// It does not belong: request handling (controller.ts) or schemas (schema.ts).
import { Router } from 'express'

import { validate } from '../../../middleware/validate'
import { postSdkTelemetry } from './controller'
import { postSdkTelemetryRequest } from './schema'

const router = Router()

router.post('/', validate(postSdkTelemetryRequest), postSdkTelemetry)

export default router
