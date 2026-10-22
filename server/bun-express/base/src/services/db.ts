import { memory, type RecordStore } from '../infra/memory'

export type { Collection, RecordStore } from '../infra/memory'

// The seam: the active record store. A file seam, not a type seam: the data-layer task
// rewrites this file to export the chosen engine's client (its type changes), rewrites every
// `api/*/repository.ts` and `services/session.ts` against it, adds `infra/<engine>.ts` to // @auth
// `api/*/repository.ts` against it, adds `infra/<engine>.ts` to // @noauth
// `dependencies`, and adds `infra/scripts/migrate.ts`. Only `repository.ts`, `model.ts` and
// `services/` and `infra/` files import this; module `route`, `controller`, `service` and `schema` files
// never do (a lint zone).
export function getDb(): RecordStore {
  return memory
}
