import { SQL } from 'bun'

import { env } from '../../config/env'
import { log } from '../../services/logger'
import { migrate } from './migrate'

// `bun run db:e2e`: prepares the e2e database the browser suite runs against. It creates the
// database named by E2E_DATABASE_URL when it is missing, applies the migrations and empties every
// table but the migration record, so each run starts from the same state. It refuses any name that
// does not end in `_e2e`: this script deletes rows, and a wrong URL must not reach real data.

const E2E_SUFFIX = '_e2e'
const MAINTENANCE_DATABASE = 'postgres'
const MIGRATION_TABLE = 'schema_migration'
// The server answers "duplicate_database" when two runs create the same database together.
const DUPLICATE_DATABASE = '42P04'

export function databaseName(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.slice(1))
  } catch {
    return ''
  }
}

// Returns the name. The message holds the name only, never the URL: the URL carries the password.
export function assertE2eDatabase(url: string): string {
  const name = databaseName(url)
  if (!name.endsWith(E2E_SUFFIX)) {
    throw new Error(
      `E2E_DATABASE_URL names the database "${name}"; the e2e run truncates tables, so the name must end in ${E2E_SUFFIX}`,
    )
  }
  // libpq lets a `dbname` query override the path, so the name checked above would not be the one used.
  for (const key of new URL(url).searchParams.keys()) {
    if (key.toLowerCase() === 'dbname') {
      throw new Error(
        'E2E_DATABASE_URL carries a "dbname" query, which overrides the database in its path; remove it',
      )
    }
  }
  return name
}

// Same server and credentials, on the maintenance database: CREATE DATABASE cannot run on the
// database it creates.
export function maintenanceUrl(url: string): string {
  const parsed = new URL(url)
  parsed.pathname = `/${MAINTENANCE_DATABASE}`
  return parsed.toString()
}

export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`
}

// One statement for every table but the migration record; undefined when there is none.
export function truncateStatement(tables: readonly string[]): string | undefined {
  const names = tables.filter((table) => table !== MIGRATION_TABLE).map(quoteIdentifier)
  return names.length === 0
    ? undefined
    : `truncate table ${names.join(', ')} restart identity cascade`
}

async function createIfMissing(url: string, name: string): Promise<boolean> {
  const admin = new SQL(maintenanceUrl(url), { max: 1, connectionTimeout: 4 })
  try {
    const rows = await admin<unknown[]>`select 1 from pg_database where datname = ${name}`
    if (rows.length > 0) return false
    try {
      await admin.unsafe(`create database ${quoteIdentifier(name)}`)
    } catch (error) {
      if ((error as { errno?: string }).errno === DUPLICATE_DATABASE) return false
      throw error
    }
    return true
  } finally {
    await admin.close({ timeout: 2 })
  }
}

export async function prepareE2eDatabase(url: string): Promise<void> {
  const name = assertE2eDatabase(url)
  const created = await createIfMissing(url, name)
  log.info(created ? 'created the e2e database' : 'found the e2e database', { database: name })

  const client = new SQL(url, { max: 2, connectionTimeout: 4 })
  try {
    const [current] = await client<{ name: string }[]>`select current_database() as name`
    // The connection could land elsewhere than the URL says (a proxy, a rewritten host): check
    // before the migrations, which write.
    if (!current?.name.endsWith(E2E_SUFFIX)) {
      throw new Error('refusing to migrate or truncate a database that is not an e2e database')
    }
    await migrate({ client })
    const tables = await client<{ tablename: string }[]>`
      select tablename from pg_tables where schemaname = 'public'`
    const statement = truncateStatement(tables.map((table) => table.tablename))
    if (statement !== undefined) await client.unsafe(statement)
    log.info('e2e database ready', { database: name, tables: tables.length })
  } finally {
    await client.close({ timeout: 2 })
  }
}

if (import.meta.main) {
  try {
    await prepareE2eDatabase(env.E2E_DATABASE_URL)
    process.exit(0)
  } catch (error) {
    log.error('e2e database failed', {}, error)
    process.exit(1)
  }
}
