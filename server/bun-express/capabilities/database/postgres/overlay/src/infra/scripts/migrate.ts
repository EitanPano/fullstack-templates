import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { SQL } from 'bun'

import { log, type Logger } from '../../services/logger'
import { postgres, postgresClient } from '../postgres'

// `bun run db:migrate`: applies the SQL files in infra/migrations/ that `schema_migration` does
// not list yet, in name order. Run it on deploy before the new version starts; the server never
// migrates on its own.

// Advisory locks belong to a session, so the lock is taken on one reserved connection and held
// for the whole run: two migrations started together (two replicas, a CI job) take turns.
const LOCK_KEY = 8_401_001

const DEFAULT_DIRECTORY = fileURLToPath(new URL('../migrations', import.meta.url))

type MigrateOptions = {
  client?: SQL
  directory?: string
  logger?: Logger
}

// Returns the names it applied. Each file and its `schema_migration` row commit together, so a
// failure leaves that file entirely unapplied and the files before it applied.
export async function migrate({
  client = postgresClient(),
  directory = DEFAULT_DIRECTORY,
  logger = log,
}: MigrateOptions = {}): Promise<string[]> {
  const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()

  const lock = await client.reserve()
  try {
    await lock`select pg_advisory_lock(${LOCK_KEY})`
    await client`
      create table if not exists schema_migration (
        name text primary key,
        applied_at timestamptz not null
      )`
    const rows = await client<{ name: string }[]>`select name from schema_migration`
    const done = new Set(rows.map((row) => row.name))

    const applied: string[] = []
    for (const name of files) {
      if (done.has(name)) continue
      const text = await readFile(path.join(directory, name), 'utf8')
      await client.begin(async (tx) => {
        await tx.unsafe(text)
        await tx`insert into schema_migration (name, applied_at) values (${name}, now())`
      })
      logger.info('migrated', { file: name })
      applied.push(name)
    }
    return applied
  } finally {
    try {
      await lock`select pg_advisory_unlock(${LOCK_KEY})`
    } catch (error) {
      // The connection is broken; the server drops the lock with its session.
      logger.warn('releasing the migration lock failed', {
        reason: error instanceof Error ? error.message : String(error),
      })
    } finally {
      lock.release()
    }
  }
}

if (import.meta.main) {
  try {
    const applied = await migrate()
    log.info('migrations done', { applied: applied.length })
    await postgres.close()
    process.exit(0)
  } catch (error) {
    log.error('migration failed', {}, error)
    await postgres.close().catch(() => undefined)
    process.exit(1)
  }
}
