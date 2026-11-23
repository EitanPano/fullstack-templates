// service.ts belongs: every query for this directory's entity and nothing else, private to
// this directory: only its controller.ts imports it.
// It is one of the only files (with model.ts, when the engine defines models in code) that
// import the store from services/db.ts; the data-layer task rewrites the bodies for the chosen
// engine and keeps the signatures.
// It does not belong: business rules, error mapping or events (controller.ts).
import type { EntityRecord } from '../../models/entity/interface'
import { getDb } from '../../services/db'
import { decodeCursor, encodeCursor, toPage, type Page } from '../../services/utils/pagination'
import { z } from '../../services/utils/zod'

// Taken per call, never at file scope: a swapped or reset store must be the one used.
const entities = () => getDb().collection<EntityRecord>('entity')

// The cursor encodes the sort key (createdAt, id); the id breaks ties between equal timestamps.
const Cursor = z.object({ createdAt: z.iso.datetime(), id: z.string() })
type Cursor = z.infer<typeof Cursor>

function cursorOf(record: EntityRecord): string {
  return encodeCursor({ createdAt: record.createdAt.toISOString(), id: record.id })
}

export function findEntityById(id: string): Promise<EntityRecord | undefined> {
  return entities().get(id)
}

export function createEntity(record: EntityRecord): Promise<EntityRecord> {
  return entities().put(record)
}

// `put` upserts by id, so an update is the same call as a create.
export function updateEntity(record: EntityRecord): Promise<EntityRecord> {
  return entities().put(record)
}

export function deleteEntity(id: string): Promise<boolean> {
  return entities().delete(id)
}

// (createdAt, id) ascending; fetches `limit + 1` rows so toPage can tell whether a next page
// exists. An invalid cursor throws a 400 from decodeCursor.
export async function listEntities({
  cursor,
  limit,
}: {
  cursor: string | undefined
  limit: number
}): Promise<Page<EntityRecord>> {
  const after = cursor === undefined ? undefined : decodeCursor(cursor, Cursor)
  const records = await entities().find((record) => after === undefined || isAfter(record, after))
  records.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || compareId(a.id, b.id))
  return toPage(records.slice(0, limit + 1), limit, cursorOf)
}

function isAfter(record: EntityRecord, after: Cursor): boolean {
  const at = record.createdAt.getTime()
  const floor = Date.parse(after.createdAt)
  return at > floor || (at === floor && record.id > after.id)
}

function compareId(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}
