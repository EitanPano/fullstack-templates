import type { SQL, TransactionSQL } from 'bun'

import { postgresClient } from '../infra/postgres'

// The seam: the active database client, Bun's `SQL` over the pool in `infra/postgres.ts`. A
// file seam, not a type seam: the engine's client type shows through here, so a module's
// `service.ts` is written against it. Only a module's `service.ts` and `model.ts` and
// `services/` and `infra/` files import this; module `routes`, `controller` and `schema` files
// never do (a lint zone).
// A query takes an `Executor` so one transaction can span several of them: the client itself,
// or the transaction handle `getDb().begin(...)` passes to its callback.
export type Executor = SQL | TransactionSQL

// Taken per call, never at file scope: the client is built on first use and replaced after a
// close.
export function getDb(): SQL {
  return postgresClient()
}
