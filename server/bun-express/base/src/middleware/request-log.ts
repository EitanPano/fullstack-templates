import type { RequestHandler } from 'express'

import { log, type Logger } from '../services/logger'

// One line per finished request through the logger (which is quiet under bun test).
// Headers and bodies are never logged: they can carry credentials.
export function createRequestLog(logger: Logger = log): RequestHandler {
  return (req, res, next) => {
    const started = performance.now()
    // The query string can carry a token or an address, so only the path is logged.
    const path = req.originalUrl.split('?')[0] ?? ''
    res.on('finish', () => {
      const durationMs = Math.round(performance.now() - started)
      logger.info(`${req.method} ${path} ${String(res.statusCode)} ${String(durationMs)}ms`, {
        requestId: res.locals.requestId,
      })
    })
    next()
  }
}

export const requestLog = createRequestLog()
