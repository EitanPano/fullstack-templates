// This directory is the reference a developer copies for a new entity; the file kinds an entity
// does not need are deleted after the copy.
//
// interface.ts belongs: the stored record, exactly what a module's service.ts reads and writes.
// Timestamps are `Date` (the table stores epoch milliseconds). Despite the file name this is a
// `type` alias, not an `interface`: the lint prefers `type`.
// It does not belong: the public shape, request inputs or value sets (type.ts, enum.ts).
import type { ModuleStatus } from './enum'

export type ModuleRecord = {
  id: string
  name: string
  status: ModuleStatus
  createdAt: Date
  updatedAt: Date
}
