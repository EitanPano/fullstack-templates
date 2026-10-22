import { memory, type RecordStore } from '../infra/memory'

export type { Collection, RecordStore } from '../infra/memory'

// The seam: the active record store. A file seam, not a type seam: the data-layer task
// rewrites this file to export the chosen engine's client (its type changes), rewrites every
// `api/*/service.ts` and `services/session.ts` against it, adds `infra/<engine>.ts` to // @auth
// `api/*/service.ts` against it, adds `infra/<engine>.ts` to // @noauth
// `dependencies`, and adds `infra/scripts/migrate.ts`. Only a module's `service.ts` and
// `model.ts` and `services/` and `infra/` files import this; module `routes`, `controller` and
// `schema` files never do (a lint zone).
export function getDb(): RecordStore {
  return memory
}
