import type { ZodType } from 'zod'

import { ErrorBody } from './error'

// Helpers for api/<name>/schema.ts registrations, so every endpoint documents its
// responses the same way.
export function jsonResponse(description: string, schema: ZodType) {
  return { description, content: { 'application/json': { schema } } }
}

export function jsonBody(schema: ZodType) {
  return { content: { 'application/json': { schema } } }
}

const ERROR_DESCRIPTION: Record<number, string> = {
  400: 'Validation failed',
  401: 'Unauthenticated',
  403: 'Forbidden',
  404: 'Not found',
  409: 'Conflict',
  413: 'Payload too large',
  415: 'Unsupported media type',
  429: 'Rate limited',
  500: 'Unexpected error',
  503: 'Upstream unavailable',
}

export function errorResponses(...statuses: number[]) {
  return Object.fromEntries(
    statuses.map((status) => [
      status,
      jsonResponse(ERROR_DESCRIPTION[status] ?? `Error ${String(status)}`, ErrorBody),
    ]),
  )
}
