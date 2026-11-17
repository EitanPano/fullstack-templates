// index.ts belongs: GET /api/health, the liveness check. A route file is its gate chain and the
// call to the controller, nothing else. It does not belong: logic (server/api/health/controller.ts).
import { getHealth } from '../../../server/api/health/controller'
import { handle, methodNotAllowed } from '../../../server/middleware/handler'

export const onRequestGet = handle(getHealth)
export const onRequest = methodNotAllowed('GET')
