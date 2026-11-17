// model.ts belongs: the module's table, in Drizzle's SQLite dialect. `bun run db:generate` turns a
// change here into SQL in migrations/. Timestamps are integers: epoch milliseconds, read back as
// `Date`. Only this module's service.ts imports it.
// It does not belong: queries (service.ts) or the entity's types (server/models/module).
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { ModuleStatus } from '../../models/module/enum'

export const moduleTable = sqliteTable(
  'module',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    status: text('status', { enum: [ModuleStatus.active, ModuleStatus.archived] }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('module_created_at_id_idx').on(table.createdAt, table.id)],
)
