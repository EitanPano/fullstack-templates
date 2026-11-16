// bindings.ts belongs: the platform's bindings as the server sees them: the type of the object a
// function receives as `env` (generated into worker-configuration.d.ts by `wrangler types`) and
// the accessor that fails with a clear message when one is missing.
// It does not belong: configuration values (config/env.ts parses them) or a connection kept
// between requests: a binding is read from the request, never stored at module level.
export type Bindings = Env

export function d1(bindings: Bindings): D1Database {
  // The generated type says DB is always there; a project that renamed it in wrangler.jsonc and
  // not in the code gets this message instead of an undefined access.
  const database = (bindings as { DB?: D1Database }).DB
  if (database === undefined) {
    throw new Error('the DB binding is missing: check d1_databases in wrangler.jsonc')
  }
  return database
}
