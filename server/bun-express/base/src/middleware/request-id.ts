import { randomUUID } from 'node:crypto'

import type { RequestHandler } from 'express'

const REQUEST_ID = /^[\w.-]{8,128}$/

// Gives every request an id (honouring a well-formed incoming x-request-id) and echoes it
// in the response header, so a client's report and a log line can be matched.
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id')
  res.locals.requestId =
    incoming !== undefined && REQUEST_ID.test(incoming) ? incoming : randomUUID()
  res.setHeader('x-request-id', res.locals.requestId)
  next()
}
