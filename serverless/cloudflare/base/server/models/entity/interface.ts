// This directory is the reference a developer copies for a new entity; the file kinds an entity
// does not need are deleted after the copy.
//
// interface.ts belongs: the stored record, exactly what an entity's service.ts reads and writes.
// Timestamps are `Date`. Despite the file name this is a
// `type` alias, not an `interface`: the lint prefers `type`.
// It does not belong: the public shape, request inputs or value sets (type.ts, enum.ts).
// models/ imports only models/ (a lint leaf), not even zod. The zod schema in
// api/entity/schema.ts is written `satisfies z.ZodType<...>` against these types, so nothing is
// declared twice.
import type { EntityStatus } from './enum'

export type EntityRecord = {
  id: string
  name: string
  status: EntityStatus
  createdAt: Date
  updatedAt: Date
}
