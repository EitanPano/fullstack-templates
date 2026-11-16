// index.ts belongs: GET and POST /api/module. A route file is its gate chain and the call to the
// controller, nothing else. It does not belong: logic (server/api/module/controller.ts).
import { createModuleRequest, listModuleRequest } from '@shared/schemas/module'

import { createModule, listModule } from '../../../server/api/module/controller'
import { RATE_LIMITS } from '../../../server/config/constants'
import { handle, methodNotAllowed } from '../../../server/middleware/handler'
import { byIp, rateLimit } from '../../../server/middleware/rate-limit'
import { validate } from '../../../server/middleware/validate'

export const onRequestGet = handle(validate(listModuleRequest), listModule)
export const onRequestPost = handle(
  rateLimit({ name: 'createModulePerIp', ...RATE_LIMITS.createModulePerIp, key: byIp }),
  validate(createModuleRequest),
  createModule,
)
export const onRequest = methodNotAllowed('GET', 'POST')
