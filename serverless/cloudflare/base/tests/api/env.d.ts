// env.d.ts belongs: the test-only additions to the worker's bindings and the type of its main
// module, so `exports.default.fetch` and `env.TEST_MIGRATIONS` are typed.
declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: { default: ExportedHandler<Cloudflare.Env> }
  }
  interface Env {
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[]
  }
}
