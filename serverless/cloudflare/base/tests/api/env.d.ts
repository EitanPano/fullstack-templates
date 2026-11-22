// env.d.ts belongs: the test-only additions to the worker's bindings, so `env.TEST_MIGRATIONS` is
// typed. The type of the main module (`exports.default.fetch`) is generated into
// worker-configuration.d.ts from wrangler.jsonc's `main`.
declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[]
  }
}
