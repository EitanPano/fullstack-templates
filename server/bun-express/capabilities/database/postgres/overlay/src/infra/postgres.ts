import { SQL } from 'bun'

import { env } from '../config/env'
import type { Resource } from './dependency'

// The Postgres store as a Resource, over Bun's built-in SQL client (a pool). Nothing connects
// at import: the client is built on first use, so a test or a tool that imports the app never
// opens a socket, and `close` forgets it so a later `connect` builds a new one (a closed
// client cannot be reused). The pool reconnects on its own after a drop, which is why this
// file has no retry loop: `connectAll` retries the first connection, the driver does the rest.
// Only `services/db.ts` and `infra/` import this file.

// Below withRetry's 5 s attempt timeout, so a black-holed host fails the attempt with a
// driver error instead of the generic timeout.
const CONNECT_TIMEOUT_SECONDS = 4
const CLOSE_TIMEOUT_SECONDS = 5
const POOL_SIZE = 10

let client: SQL | undefined

export function postgresClient(): SQL {
  client ??= new SQL(env.DATABASE_URL, {
    max: POOL_SIZE,
    connectionTimeout: CONNECT_TIMEOUT_SECONDS,
  })
  return client
}

// A failed or ended attempt is closed on its way out; its own failure must not hide the cause.
async function discard(built: SQL): Promise<void> {
  if (client === built) client = undefined
  try {
    await built.close({ timeout: 0 })
  } catch {
    // Nothing left to release.
  }
}

export const postgres: Resource = {
  name: 'postgres',
  async connect() {
    const built = postgresClient()
    try {
      await built`select 1`
    } catch (error) {
      await discard(built)
      throw error
    }
  },
  async ping() {
    await postgresClient()`select 1`
  },
  async close() {
    const built = client
    client = undefined
    if (built === undefined) return
    await built.close({ timeout: CLOSE_TIMEOUT_SECONDS })
  },
}
