// ready.ts belongs: GET /api/health/ready, the readiness check (pings the database, 503 when it
// is down). It does not belong: logic (server/api/health/controller.ts).
import { getReadiness } from '../../../server/api/health/controller'
import { handle, methodNotAllowed } from '../../../server/middleware/handler'

export const onRequestGet = handle(getReadiness)
export const onRequest = methodNotAllowed('GET')
