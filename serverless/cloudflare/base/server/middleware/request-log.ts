// request-log.ts belongs: the one line written per finished request: method, path without the
// query, status, duration and request id. Headers and bodies are never logged: they can carry
// credentials. It does not belong: errors (error-handler.ts logs an unexpected one with its stack).
import type { Logger } from '../services/logger'

export function logRequest(
  log: Logger,
  request: Request,
  response: Response,
  started: number,
): void {
  log.info('request', {
    method: request.method,
    // The query string can carry a token or an address, so only the path is logged.
    path: new URL(request.url).pathname,
    status: response.status,
    durationMs: Math.round(performance.now() - started),
  })
}
