// service.ts belongs: every query for this directory's entity and nothing else, private to this
// directory: only its controller.ts imports it. It receives the Drizzle client from the
// controller and never reads a binding itself. D1 has no interactive transaction: a rule that
// must not race is one conditional statement (UPDATE ... WHERE ... RETURNING) or one batch.
// It does not belong: business rules, error mapping or HTTP (controller.ts).
import { and, asc, eq, gt, or } from 'drizzle-orm'
import { z } from 'zod'

import type { Db } from '../../infra/db'
import type { ModuleRecord } from '../../models/module/interface'
import { decodeCursor, encodeCursor, toPage } from '../../services/utils/pagination'
import type { Page } from '@shared/types/api'
import { moduleTable } from './model'

// The cursor encodes the sort key (createdAt in milliseconds, id); the id breaks ties between
// equal timestamps.
const Cursor = z.object({ createdAt: z.number().int(), id: z.string() })

function cursorOf(record: ModuleRecord): string {
  return encodeCursor({ createdAt: record.createdAt.getTime(), id: record.id })
}

export async function findModuleById(db: Db, id: string): Promise<ModuleRecord | undefined> {
  const [record] = await db.select().from(moduleTable).where(eq(moduleTable.id, id))
  return record
}

export async function createModule(db: Db, record: ModuleRecord): Promise<ModuleRecord> {
  const [created] = await db.insert(moduleTable).values(record).returning()
  if (created === undefined) throw new Error('insert returned no row')
  return created
}

// One statement: the row is changed only if it still exists.
export function updateModule(db: Db, record: ModuleRecord): Promise<ModuleRecord | undefined> {
  return db
    .update(moduleTable)
    .set({ name: record.name, status: record.status, updatedAt: record.updatedAt })
    .where(eq(moduleTable.id, record.id))
    .returning()
    .then(([updated]) => updated)
}

export async function deleteModule(db: Db, id: string): Promise<boolean> {
  const deleted = await db
    .delete(moduleTable)
    .where(eq(moduleTable.id, id))
    .returning({ id: moduleTable.id })
  return deleted.length > 0
}

// (createdAt, id) ascending; fetches `limit + 1` rows so toPage can tell whether a next page
// exists. An invalid cursor throws a 400 from decodeCursor.
export async function listModules(
  db: Db,
  { cursor, limit }: { cursor: string | undefined; limit: number },
): Promise<Page<ModuleRecord>> {
  const after = cursor === undefined ? undefined : decodeCursor(cursor, Cursor)
  const rows = await db
    .select()
    .from(moduleTable)
    .where(
      after === undefined
        ? undefined
        : or(
            gt(moduleTable.createdAt, new Date(after.createdAt)),
            and(eq(moduleTable.createdAt, new Date(after.createdAt)), gt(moduleTable.id, after.id)),
          ),
    )
    .orderBy(asc(moduleTable.createdAt), asc(moduleTable.id))
    .limit(limit + 1)
  return toPage(rows, limit, cursorOf)
}
