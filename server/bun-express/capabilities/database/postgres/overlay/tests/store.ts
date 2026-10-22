import { describe } from 'bun:test'

import { env } from '../src/config/env'
import { memory } from '../src/infra/memory'
import { getDb } from '../src/services/db'

// The test seam over the store, as `src/services/db.ts` is the seam in `src/`: store-backed
// suites reset and inspect the store only through these exports. In the Postgres variant
// `describeStore` is `describe.skip` unless `DATABASE_URL` names a test database, so `check`
// runs without one and `test:db` (tests/db/setup.ts) points the suites at `app_test`.
function databaseName(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.slice(1))
  } catch {
    return ''
  }
}

export const describeStore: typeof describe = databaseName(env.DATABASE_URL).endsWith('_test')
  ? describe
  : describe.skip

function quoted(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`
}

// Empties every table but the migration record, and the in-memory cache. It refuses any
// database whose name does not end in `_test`, so a wrong DATABASE_URL cannot wipe real data.
export async function resetStore(): Promise<void> {
  const db = getDb()
  const [current] = await db<{ name: string }[]>`select current_database() as name`
  if (!current?.name.endsWith('_test')) {
    throw new Error('resetStore refuses to truncate a database that is not a test database')
  }
  const tables = await db<{ tablename: string }[]>`
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> 'schema_migration'`
  if (tables.length > 0) {
    const names = tables.map((table) => quoted(table.tablename)).join(', ')
    await db.unsafe(`truncate table ${names} restart identity cascade`)
  }
  await memory.close()
}

export async function recordExists(collection: string, id: string): Promise<boolean> {
  const rows = await getDb().unsafe<unknown[]>(
    `select 1 from ${quoted(collection)} where id = $1`,
    [id],
  )
  return rows.length > 0
}

export async function deleteRecord(collection: string, id: string): Promise<void> {
  await getDb().unsafe(`delete from ${quoted(collection)} where id = $1`, [id])
}
