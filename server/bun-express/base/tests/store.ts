import { describe } from 'bun:test'

import { memory } from '../src/infra/memory'
import { getDb } from '../src/services/db'

// The test seam over the record store, as `src/services/db.ts` is the seam in `src/`:
// store-backed suites reset and inspect the store only through these exports. A database
// overlay or the data-layer task rewrites this file for the engine, where `describeStore`
// becomes `describe.skip` unless the database is a test one.
export const describeStore: typeof describe = describe

// Empties the record store and the key-value store.
export async function resetStore(): Promise<void> {
  await memory.close()
}

export async function recordExists(collection: string, id: string): Promise<boolean> {
  return (await getDb().collection(collection).get(id)) !== undefined
}

export async function deleteRecord(collection: string, id: string): Promise<void> {
  await getDb().collection(collection).delete(id)
}
