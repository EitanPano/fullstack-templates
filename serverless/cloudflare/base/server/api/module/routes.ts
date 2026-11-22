// routes.ts belongs: this module's router, mounted at /api/module by server/server.ts. Each endpoint
// is one line: its gate chain, validation and the call to its controller; a path also answers 405
// for the methods it does not register.
// It does not belong: logic (controller.ts), queries (service.ts) or schemas (schema.ts).
//
// Reference module: AGENTS.md > Adding a module explains how to copy it.
import { Hono } from 'hono'

import { RATE_LIMITS } from '../../config/constants'
import { handle, methodNotAllowed, type AppEnv } from '../../middleware/handler'
import { byIp, rateLimit } from '../../middleware/rate-limit'
import { validate } from '../../middleware/validate'
import { createModule, deleteModule, getModule, listModule, updateModule } from './controller'
import {
  createModuleRequest,
  deleteModuleRequest,
  getModuleRequest,
  listModuleRequest,
  updateModuleRequest,
} from './schema'

const routes = new Hono<AppEnv>()

routes.get('/', handle(validate(listModuleRequest), listModule))
routes.post(
  '/',
  handle(
    rateLimit({ name: 'createModulePerIp', ...RATE_LIMITS.createModulePerIp, key: byIp }),
    validate(createModuleRequest),
    createModule,
  ),
)
routes.all('/', methodNotAllowed('GET', 'POST'))

routes.get('/:id', handle(validate(getModuleRequest), getModule))
routes.patch(
  '/:id',
  handle(
    rateLimit({ name: 'updateModulePerIp', ...RATE_LIMITS.updateModulePerIp, key: byIp }),
    validate(updateModuleRequest),
    updateModule,
  ),
)
routes.delete(
  '/:id',
  handle(
    rateLimit({ name: 'deleteModulePerIp', ...RATE_LIMITS.deleteModulePerIp, key: byIp }),
    validate(deleteModuleRequest),
    deleteModule,
  ),
)
routes.all('/:id', methodNotAllowed('GET', 'PATCH', 'DELETE'))

export default routes
