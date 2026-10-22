// This directory is the reference a developer copies for a new entity; the file kinds an entity
// does not need are deleted after the copy.
//
// interface.ts belongs: the stored record, exactly what a repository reads and writes.
// Timestamps are `Date`. An optional field is written `field?: T` (the project compiles with
// `exactOptionalPropertyTypes`, so an absent field and `undefined` are different things).
// It does not belong: the public shape, request inputs or value sets (type.ts, enum.ts).
//
// Despite the file name this is a `type` alias, not an `interface`: the lint prefers `type`.
// models/ imports only models/ (a lint leaf), not even zod. The zod schema in
// api/module/schema.ts is written `satisfies z.ZodType<...>` against these types, so nothing is
// declared twice.
import type { ModuleStatus } from './enum'

export type ModuleRecord = {
  id: string
  name: string
  status: ModuleStatus
  createdAt: Date
  updatedAt: Date
}
