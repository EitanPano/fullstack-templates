// service.ts belongs: every query for this directory's entity and nothing else, private to
// this directory: only its controller.ts imports it.
// It is one of the only files (with model.ts, when the engine defines models in code) that
// import the client from services/db.ts. This is the Postgres variant: the bodies are SQL
// against the `module` table (infra/migrations/0001-init.sql) and the signatures are the
// memory variant's, plus an optional last `db` so a controller can run several queries in one
// transaction (`withTransaction`). Without it a query takes its own connection from the pool.
// It does not belong: business rules, error mapping or events (controller.ts).
import type { ModuleStatus } from '../../models/module/enum'
import type { ModuleRecord } from '../../models/module/interface'
import { type Executor, getDb } from '../../services/db'
import { decodeCursor, encodeCursor, toPage, type Page } from '../../services/utils/pagination'
import { z } from '../../services/utils/zod'

// The columns as stored; `toRecord` is the only place that maps them to the record.
type ModuleRow = {
  id: string
  name: string
  status: ModuleStatus
  created_at: Date
  updated_at: Date
}

function toRecord(row: ModuleRow): ModuleRecord {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// The cursor encodes the sort key (createdAt, id); the id breaks ties between equal timestamps.
const Cursor = z.object({ createdAt: z.iso.datetime(), id: z.string() })
type Cursor = z.infer<typeof Cursor>

function cursorOf(record: ModuleRecord): string {
  return encodeCursor({ createdAt: record.createdAt.toISOString(), id: record.id })
}

// Runs `work` in one transaction: commit when it resolves, roll back when it throws. This is
// the reference for a controller that must write two things together; the controller passes
// the handle to each service call as its last argument. A service function never opens one.
export function withTransaction<T>(work: (tx: Executor) => Promise<T>): Promise<T> {
  return getDb().begin(async (tx) => work(tx))
}

export async function findModuleById(
  id: string,
  db: Executor = getDb(),
): Promise<ModuleRecord | undefined> {
  const rows = await db<ModuleRow[]>`
    select id, name, status, created_at, updated_at from module where id = ${id}`
  const row = rows[0]
  return row === undefined ? undefined : toRecord(row)
}

export async function createModule(
  record: ModuleRecord,
  db: Executor = getDb(),
): Promise<ModuleRecord> {
  const rows = await db<ModuleRow[]>`
    insert into module (id, name, status, created_at, updated_at)
    values (${record.id}, ${record.name}, ${record.status}, ${record.createdAt}, ${record.updatedAt})
    returning id, name, status, created_at, updated_at`
  return toRecord(requireRow(rows))
}

// An upsert by id, like the memory variant's `put`, so an update is the same call as a create.
// `created_at` is never rewritten.
export async function updateModule(
  record: ModuleRecord,
  db: Executor = getDb(),
): Promise<ModuleRecord> {
  const rows = await db<ModuleRow[]>`
    insert into module (id, name, status, created_at, updated_at)
    values (${record.id}, ${record.name}, ${record.status}, ${record.createdAt}, ${record.updatedAt})
    on conflict (id) do update
      set name = excluded.name, status = excluded.status, updated_at = excluded.updated_at
    returning id, name, status, created_at, updated_at`
  return toRecord(requireRow(rows))
}

export async function deleteModule(id: string, db: Executor = getDb()): Promise<boolean> {
  const rows = await db<{ id: string }[]>`delete from module where id = ${id} returning id`
  return rows.length > 0
}

// (createdAt, id) ascending; fetches `limit + 1` rows so toPage can tell whether a next page
// exists. An invalid cursor throws a 400 from decodeCursor.
export async function listModules(
  {
    cursor,
    limit,
  }: {
    cursor: string | undefined
    limit: number
  },
  db: Executor = getDb(),
): Promise<Page<ModuleRecord>> {
  const after = cursor === undefined ? undefined : decodeCursor(cursor, Cursor)
  const rows =
    after === undefined
      ? await db<ModuleRow[]>`
          select id, name, status, created_at, updated_at from module
          order by created_at, id limit ${limit + 1}`
      : await db<ModuleRow[]>`
          select id, name, status, created_at, updated_at from module
          where (created_at, id) > (${new Date(after.createdAt)}, ${after.id})
          order by created_at, id limit ${limit + 1}`
  return toPage(rows.map(toRecord), limit, cursorOf)
}

// `returning` always yields the row it wrote; an empty result would mean the driver broke.
function requireRow(rows: ModuleRow[]): ModuleRow {
  const row = rows[0]
  if (row === undefined) throw new Error('module write returned no row')
  return row
}
