// service.ts belongs: every query for this directory's entity and nothing else, private to this
// directory: only its controller.ts imports it. It receives the Drizzle client from the
// controller and never reads a binding itself. D1 has no interactive transaction: a rule that
// must not race is one conditional statement (UPDATE ... WHERE ... RETURNING) or one batch.
// It does not belong: business rules, error mapping or HTTP (controller.ts).
import { and, asc, eq, gt, or } from 'drizzle-orm'
import { z } from 'zod'

import type { Db } from '../../infra/db'
import type { EntityRecord } from '../../models/entity/interface'
import { decodeCursor, encodeCursor, toPage, type Page } from '../../services/utils/pagination'
import { entityTable } from './model'

// The cursor encodes the sort key (createdAt in milliseconds, id); the id breaks ties between
// equal timestamps.
const Cursor = z.object({ createdAt: z.number().int(), id: z.string() })

function cursorOf(record: EntityRecord): string {
  return encodeCursor({ createdAt: record.createdAt.getTime(), id: record.id })
}

export async function findEntityById(db: Db, id: string): Promise<EntityRecord | undefined> {
  const [record] = await db.select().from(entityTable).where(eq(entityTable.id, id))
  return record
}

export async function createEntity(db: Db, record: EntityRecord): Promise<EntityRecord> {
  const [created] = await db.insert(entityTable).values(record).returning()
  if (created === undefined) throw new Error('insert returned no row')
  return created
}

// One statement: the row is changed only if it still exists.
export function updateEntity(db: Db, record: EntityRecord): Promise<EntityRecord | undefined> {
  return db
    .update(entityTable)
    .set({ name: record.name, status: record.status, updatedAt: record.updatedAt })
    .where(eq(entityTable.id, record.id))
    .returning()
    .then(([updated]) => updated)
}

export async function deleteEntity(db: Db, id: string): Promise<boolean> {
  const deleted = await db
    .delete(entityTable)
    .where(eq(entityTable.id, id))
    .returning({ id: entityTable.id })
  return deleted.length > 0
}

// (createdAt, id) ascending; fetches `limit + 1` rows so toPage can tell whether a next page
// exists. An invalid cursor throws a 400 from decodeCursor.
export async function listEntities(
  db: Db,
  { cursor, limit }: { cursor: string | undefined; limit: number },
): Promise<Page<EntityRecord>> {
  const after = cursor === undefined ? undefined : decodeCursor(cursor, Cursor)
  const rows = await db
    .select()
    .from(entityTable)
    .where(
      after === undefined
        ? undefined
        : or(
            gt(entityTable.createdAt, new Date(after.createdAt)),
            and(eq(entityTable.createdAt, new Date(after.createdAt)), gt(entityTable.id, after.id)),
          ),
    )
    .orderBy(asc(entityTable.createdAt), asc(entityTable.id))
    .limit(limit + 1)
  return toPage(rows, limit, cursorOf)
}
