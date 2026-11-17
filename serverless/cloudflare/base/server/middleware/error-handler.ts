// error-handler.ts belongs: the only place an error becomes an HTTP response. An AppError carries
// its status; a ZodError that escaped a handler is a 400; anything else is logged with its stack
// and leaves as a bare `internal` envelope, so no message, stack or query text reaches a client.
// It does not belong: building an error in a handler (throw an AppError) or the logging setup.
import { ZodError } from 'zod'

import type { Logger } from '../services/logger'
import { AppError, toErrorBody } from '../services/utils/error'

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error
  if (error instanceof ZodError) {
    return new AppError(
      'validation_failed',
      'invalid request',
      error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    )
  }
  return new AppError('internal', 'unexpected error')
}

export function errorResponse(error: unknown, requestId: string, log: Logger): Response {
  const appError = toAppError(error)
  if (appError.status >= 500) log.error(appError.message, { code: appError.code }, error)
  return Response.json(toErrorBody(appError, requestId), {
    status: appError.status,
    headers: appError.headers,
  })
}
