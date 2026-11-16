// setup.ts belongs: what every API test file starts from: the migrations applied, and every table
// emptied before each test. Storage is isolated per test file, not per test, so the reset here is
// what keeps one test from seeing another's rows.
// It does not belong: a test's own fixtures (the test creates them through the API).
import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { beforeEach } from 'vitest'

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)

beforeEach(async () => {
  const { results } = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'",
  ).all<{ name: string }>()
  await env.DB.batch(results.map((table) => env.DB.prepare(`DELETE FROM "${table.name}"`)))
})
