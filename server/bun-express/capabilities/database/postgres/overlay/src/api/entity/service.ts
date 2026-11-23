// service.ts belongs: every query for this directory's entity and nothing else, private to
// this directory: only its controller.ts imports it.
// It is one of the only files (with model.ts, when the engine defines models in code) that
// import the client from services/db.ts. This is the Postgres variant: the bodies are SQL
// against the `entity` table (infra/migrations/0001-init.sql) and the signatures are the
// memory variant's, plus an optional last `db` so a controller can run several queries in one
// transaction (`withTransaction`). Without it a query takes its own connection from the pool.
// It does not belong: business rules, error mapping or events (controller.ts).
import type { EntityStatus } from '../../models/entity/enum'
import type { EntityRecord } from '../../models/entity/interface'
import { type Executor, getDb } from '../../services/db'
import { decodeCursor, encodeCursor, toPage, type Page } from '../../services/utils/pagination'
import { z } from '../../services/utils/zod'

// The columns as stored; `toRecord` is the only place that maps them to the record.
type EntityRow = {
  id: string
  name: string
  status: EntityStatus
  created_at: Date
  updated_at: Date
}

function toRecord(row: EntityRow): EntityRecord {
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

function cursorOf(record: EntityRecord): string {
  return encodeCursor({ createdAt: record.createdAt.toISOString(), id: record.id })
}

// Runs `work` in one transaction: commit when it resolves, roll back when it throws. This is
// the reference for a controller that must write two things together; the controller passes
// the handle to each service call as its last argument. A service function never opens one.
export function withTransaction<T>(work: (tx: Executor) => Promise<T>): Promise<T> {
  return getDb().begin(async (tx) => work(tx))
}

export async function findEntityById(
  id: string,
  db: Executor = getDb(),
): Promise<EntityRecord | undefined> {
  const rows = await db<EntityRow[]>`
    select id, name, status, created_at, updated_at from entity where id = ${id}`
  const row = rows[0]
  return row === undefined ? undefined : toRecord(row)
}

export async function createEntity(
  record: EntityRecord,
  db: Executor = getDb(),
): Promise<EntityRecord> {
  const rows = await db<EntityRow[]>`
    insert into entity (id, name, status, created_at, updated_at)
    values (${record.id}, ${record.name}, ${record.status}, ${record.createdAt}, ${record.updatedAt})
    returning id, name, status, created_at, updated_at`
  return toRecord(requireRow(rows))
}

// An upsert by id, like the memory variant's `put`, so an update is the same call as a create.
// `created_at` is never rewritten.
export async function updateEntity(
  record: EntityRecord,
  db: Executor = getDb(),
): Promise<EntityRecord> {
  const rows = await db<EntityRow[]>`
    insert into entity (id, name, status, created_at, updated_at)
    values (${record.id}, ${record.name}, ${record.status}, ${record.createdAt}, ${record.updatedAt})
    on conflict (id) do update
      set name = excluded.name, status = excluded.status, updated_at = excluded.updated_at
    returning id, name, status, created_at, updated_at`
  return toRecord(requireRow(rows))
}

export async function deleteEntity(id: string, db: Executor = getDb()): Promise<boolean> {
  const rows = await db<{ id: string }[]>`delete from entity where id = ${id} returning id`
  return rows.length > 0
}

// (createdAt, id) ascending; fetches `limit + 1` rows so toPage can tell whether a next page
// exists. An invalid cursor throws a 400 from decodeCursor.
export async function listEntities(
  {
    cursor,
    limit,
  }: {
    cursor: string | undefined
    limit: number
  },
  db: Executor = getDb(),
): Promise<Page<EntityRecord>> {
  const after = cursor === undefined ? undefined : decodeCursor(cursor, Cursor)
  const rows =
    after === undefined
      ? await db<EntityRow[]>`
          select id, name, status, created_at, updated_at from entity
          order by created_at, id limit ${limit + 1}`
      : await db<EntityRow[]>`
          select id, name, status, created_at, updated_at from entity
          where (created_at, id) > (${new Date(after.createdAt)}, ${after.id})
          order by created_at, id limit ${limit + 1}`
  return toPage(rows.map(toRecord), limit, cursorOf)
}

// `returning` always yields the row it wrote; an empty result would mean the driver broke.
function requireRow(rows: EntityRow[]): EntityRow {
  const row = rows[0]
  if (row === undefined) throw new Error('entity write returned no row')
  return row
}
