// repository.ts belongs: every query for this directory's entity and nothing else, private to
// this directory.
// It is one of the only files (with model.ts, when the engine defines models in code) that
// import the store from services/db.ts; the data-layer task rewrites the bodies for the chosen
// engine and keeps the signatures.
// It does not belong: business rules or error mapping (service.ts) or HTTP (route.ts).
import type { ModuleRecord } from '../../models/module/interface'
import { getDb } from '../../services/db'
import { decodeCursor, encodeCursor, toPage, type Page } from '../../services/utils/pagination'
import { z } from '../../services/utils/zod'

// Taken per call, never at file scope: a swapped or reset store must be the one used.
const modules = () => getDb().collection<ModuleRecord>('module')

// The cursor encodes the sort key (createdAt, id); the id breaks ties between equal timestamps.
const Cursor = z.object({ createdAt: z.iso.datetime(), id: z.string() })
type Cursor = z.infer<typeof Cursor>

function cursorOf(record: ModuleRecord): string {
  return encodeCursor({ createdAt: record.createdAt.toISOString(), id: record.id })
}

export function findById(id: string): Promise<ModuleRecord | undefined> {
  return modules().get(id)
}

export function insert(record: ModuleRecord): Promise<ModuleRecord> {
  return modules().put(record)
}

// `put` upserts by id, so an update is the same call as an insert.
export function update(record: ModuleRecord): Promise<ModuleRecord> {
  return modules().put(record)
}

export function remove(id: string): Promise<boolean> {
  return modules().delete(id)
}

// (createdAt, id) ascending; fetches `limit + 1` rows so toPage can tell whether a next page
// exists. An invalid cursor throws a 400 from decodeCursor.
export async function list({
  cursor,
  limit,
}: {
  cursor: string | undefined
  limit: number
}): Promise<Page<ModuleRecord>> {
  const after = cursor === undefined ? undefined : decodeCursor(cursor, Cursor)
  const records = await modules().find((record) => after === undefined || isAfter(record, after))
  records.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || compareId(a.id, b.id))
  return toPage(records.slice(0, limit + 1), limit, cursorOf)
}

function isAfter(record: ModuleRecord, after: Cursor): boolean {
  const at = record.createdAt.getTime()
  const floor = Date.parse(after.createdAt)
  return at > floor || (at === floor && record.id > after.id)
}

function compareId(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}
