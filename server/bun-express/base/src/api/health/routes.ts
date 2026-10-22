import { Router } from 'express'

import { getHealth, getReadiness } from './controller'

// The router: one line per endpoint, the middleware it needs, then the controller's handler.
const router = Router()

router.get('/', getHealth)
router.get('/ready', getReadiness())

export default router
