// model.ts belongs: the entity's table, in Drizzle's SQLite dialect. `bun run db:generate` turns a
// change here into SQL in migrations/. Timestamps are integers: epoch milliseconds, read back as
// `Date`. Only this entity's service.ts imports it.
// It does not belong: queries (service.ts) or the entity's types (server/models/entity).
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { EntityStatus } from '../../models/entity/enum'

export const entityTable = sqliteTable(
  'entity',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    status: text('status', { enum: [EntityStatus.active, EntityStatus.archived] }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('entity_created_at_id_idx').on(table.createdAt, table.id)],
)
