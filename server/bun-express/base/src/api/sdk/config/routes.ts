// routes.ts belongs: this directory's router, one line per endpoint. The gate is on the
// namespace (api/sdk/routes.ts), so none is repeated here.
// It does not belong: request handling (controller.ts) or schemas (schema.ts).
import { Router } from 'express'

import { getSdkConfig } from './controller'

const router = Router()

router.get('/', getSdkConfig)

export default router
