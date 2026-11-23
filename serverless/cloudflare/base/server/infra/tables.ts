// tables.ts belongs: the tables the platform layers own and no entity does: the rate-limit
// counters. An entity keeps its table in its own model.ts.
// It does not belong: queries (the middleware that uses a table writes its own statement).
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// One row per limiter and hashed subject: a fixed window that opened at `windowStart` (epoch
// milliseconds) and ends at `expiresAt`. An expired row is overwritten by the next hit and deleted
// when it is stale; the index on `expires_at` lets the cleanup find stale rows without reading
// the whole table.
export const rateLimitTable = sqliteTable(
  'rate_limit',
  {
    key: text('key').primaryKey(),
    windowStart: integer('window_start').notNull(),
    expiresAt: integer('expires_at').notNull(),
    count: integer('count').notNull(),
  },
  (table) => [index('rate_limit_expires_at_idx').on(table.expiresAt)],
)
