// db.ts belongs: the Drizzle client over the request's D1 binding. An entity's service.ts receives
// the client from its controller; nothing is cached at module level, so a request never sees a
// binding another request or a test run created.
// It does not belong: queries (service.ts) or table definitions (an entity's model.ts).
import { drizzle } from 'drizzle-orm/d1'

import { d1, type Bindings } from './bindings'

export function createDb(bindings: Bindings) {
  return drizzle(d1(bindings))
}

export type Db = ReturnType<typeof createDb>
