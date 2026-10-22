import { type RequestHandler, Router } from 'express'

import type { Resource } from '../../infra/dependency'
import * as controller from './controller'

// The HTTP adapter: per endpoint, mount the middleware it needs, validate the request
// parts it reads (middleware/validate.ts), call one controller function, send the status and
// the body. No business rules here.
export const healthRoute = Router()

healthRoute.get('/', (_req, res) => {
  res.json(controller.getHealth())
})
healthRoute.get('/ready', ready())

// 200 when every dependency answers, 503 when one is down; the body is the same shape.
// `list` is the seam the tests use; the route above mounts the default.
export function ready(list?: readonly Resource[]): RequestHandler {
  return async (_req, res) => {
    const readiness = await controller.getReadiness(list)
    res.status(readiness.status === 'ok' ? 200 : 503).json(readiness)
  }
}
