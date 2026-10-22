import { SQL } from 'bun'

import { AppError } from './error'

// Maps a Postgres driver error to the AppError a client may see, or `undefined` for anything
// this file does not classify (the error handler then answers `internal`). The AppError carries
// a fixed generic message: the driver's text, the query, the detail and the constraint name
// stay in the server log.

// Bun's own codes for a connection that cannot be made or was lost.
const CONNECTION_CODES = new Set([
  'ERR_POSTGRES_CONNECTION_REFUSED',
  'ERR_POSTGRES_CONNECTION_FAILED',
  'ERR_POSTGRES_CONNECTION_CLOSED',
  'ERR_POSTGRES_CONNECTION_TIMEOUT',
  'ERR_POSTGRES_IDLE_TIMEOUT',
  'ERR_POSTGRES_LIFETIME_TIMEOUT',
])

// The server's SQLSTATE rides in `errno` (Bun sets `code` to ERR_POSTGRES_SERVER_ERROR). These
// are the states of a server that is shutting down, starting up or out of connections.
const UNAVAILABLE_STATES = new Set(['57P01', '57P02', '57P03', '53300'])

const UNIQUE_VIOLATION = '23505'

export function classifyPostgresError(error: unknown): AppError | undefined {
  if (!(error instanceof SQL.PostgresError)) return undefined
  const state = error.errno
  if (
    CONNECTION_CODES.has(error.code) ||
    (state !== undefined && (UNAVAILABLE_STATES.has(state) || state.startsWith('08')))
  ) {
    return new AppError('upstream_unavailable', 'the database is unavailable')
  }
  if (state === UNIQUE_VIOLATION) return new AppError('conflict', 'the record already exists')
  return undefined
}
