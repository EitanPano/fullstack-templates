// routes.ts belongs: this entity's router, mounted at /api/entity by server/server.ts. Each endpoint
// is one line: its gate chain, validation and the call to its controller; a path also answers 405
// for the methods it does not register.
// It does not belong: logic (controller.ts), queries (service.ts) or schemas (schema.ts).
//
// Reference entity: AGENTS.md > Adding an entity explains how to copy it.
import { Hono } from 'hono'

import { RATE_LIMITS } from '../../config/constants'
import { handle, methodNotAllowed, type AppEnv } from '../../middleware/handler'
import { byIp, rateLimit } from '../../middleware/rate-limit'
import { validate } from '../../middleware/validate'
import { createEntity, deleteEntity, getEntity, listEntity, updateEntity } from './controller'
import {
  createEntityRequest,
  deleteEntityRequest,
  getEntityRequest,
  listEntityRequest,
  updateEntityRequest,
} from './schema'

const routes = new Hono<AppEnv>()

routes.get('/', handle(validate(listEntityRequest), listEntity))
routes.post(
  '/',
  handle(
    rateLimit({ name: 'createEntityPerIp', ...RATE_LIMITS.createEntityPerIp, key: byIp }),
    validate(createEntityRequest),
    createEntity,
  ),
)
routes.all('/', methodNotAllowed('GET', 'POST'))

routes.get('/:id', handle(validate(getEntityRequest), getEntity))
routes.patch(
  '/:id',
  handle(
    rateLimit({ name: 'updateEntityPerIp', ...RATE_LIMITS.updateEntityPerIp, key: byIp }),
    validate(updateEntityRequest),
    updateEntity,
  ),
)
routes.delete(
  '/:id',
  handle(
    rateLimit({ name: 'deleteEntityPerIp', ...RATE_LIMITS.deleteEntityPerIp, key: byIp }),
    validate(deleteEntityRequest),
    deleteEntity,
  ),
)
routes.all('/:id', methodNotAllowed('GET', 'PATCH', 'DELETE'))

export default routes
