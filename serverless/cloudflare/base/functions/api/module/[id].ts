// [id].ts belongs: GET, PATCH and DELETE /api/module/{id}. A route file is its gate chain and the
// call to the controller, nothing else. It does not belong: logic (server/api/module/controller.ts).
import { deleteModuleRequest, getModuleRequest, updateModuleRequest } from '../../../server/api/module/schema'

import { deleteModule, getModule, updateModule } from '../../../server/api/module/controller'
import { RATE_LIMITS } from '../../../server/config/constants'
import { handle, methodNotAllowed } from '../../../server/middleware/handler'
import { byIp, rateLimit } from '../../../server/middleware/rate-limit'
import { validate } from '../../../server/middleware/validate'

export const onRequestGet = handle(validate(getModuleRequest), getModule)
export const onRequestPatch = handle(
  rateLimit({ name: 'updateModulePerIp', ...RATE_LIMITS.updateModulePerIp, key: byIp }),
  validate(updateModuleRequest),
  updateModule,
)
export const onRequestDelete = handle(
  rateLimit({ name: 'deleteModulePerIp', ...RATE_LIMITS.deleteModulePerIp, key: byIp }),
  validate(deleteModuleRequest),
  deleteModule,
)
export const onRequest = methodNotAllowed('GET', 'PATCH', 'DELETE')
