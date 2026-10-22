// Preloaded by `bun run test:db` only (`bun test --preload ./tests/db/setup.ts`). It points the
// whole run at the test database before anything imports src/config/env.ts, which reads the
// environment once, so every import of the app below is dynamic and comes after the assignment.
// Makes this file a module, which top-level await needs.
export {}

const DEFAULT_TEST_URL = 'postgres://app:app@localhost:5432/app_test'

const url = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_URL

function describeTarget(value: string): { name: string; host: string } {
  try {
    const parsed = new URL(value)
    return { name: decodeURIComponent(parsed.pathname.slice(1)), host: parsed.host }
  } catch {
    throw new Error('TEST_DATABASE_URL is not a valid URL')
  }
}

const target = describeTarget(url)
if (!target.name.endsWith('_test')) {
  console.error(
    `TEST_DATABASE_URL names the database "${target.name}"; the test run truncates tables, so the name must end in _test`,
  )
  process.exit(1)
}

process.env.DATABASE_URL = url

const { migrate } = await import('../../src/infra/scripts/migrate')
const { postgres } = await import('../../src/infra/postgres')

try {
  await migrate()
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error)
  console.error(
    `test database "${target.name}" on ${target.host} is not ready: ${reason}. Start it with: docker compose up -d database (at the project root)`,
  )
  process.exit(1)
} finally {
  await postgres.close().catch(() => undefined)
}
