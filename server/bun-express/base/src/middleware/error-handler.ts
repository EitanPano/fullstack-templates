import type { ErrorRequestHandler } from 'express'
import { ZodError } from 'zod'

import { log } from '../services/logger'
import { AppError, toErrorBody } from '../services/utils/error'

// The only place an error becomes an HTTP response. An AppError carries its status; a
// ZodError that escaped a route adapter is a 400; body-parser failures map to 400, 413 or 415;
// anything else is logged with its stack and leaves as a bare `internal` envelope.
export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  const requestId = res.locals.requestId
  const appError = toAppError(error)
  if (appError.status >= 500) log.error(appError.message, { requestId }, error)
  res.status(appError.status).json(toErrorBody(appError, requestId))
}

// body-parser reports its failures with a `type`; each maps to a client error, never a 500.
const BODY_PARSER_CODES: Record<string, AppError> = {
  'entity.parse.failed': new AppError('validation_failed', 'malformed JSON body'),
  'entity.verify.failed': new AppError('validation_failed', 'malformed JSON body'),
  'entity.too.large': new AppError('payload_too_large', 'request body is too large'),
  'encoding.unsupported': new AppError('unsupported_media_type', 'unsupported body encoding'),
  'charset.unsupported': new AppError('unsupported_media_type', 'unsupported body charset'),
}

function toAppError(error: unknown): AppError {
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
  if (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    typeof error.type === 'string'
  ) {
    const mapped = BODY_PARSER_CODES[error.type]
    if (mapped !== undefined) return mapped
  }
  return new AppError('internal', 'unexpected error')
}
