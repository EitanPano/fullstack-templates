// The URL the e2e API connects to. A blank E2E_DATABASE_URL (an unset CI variable exported
// empty) must not reach the API: outside production it would fall back to the development
// database and the suite would write its accounts there. So a blank takes the default, and
// anything whose database is not `*_e2e` is refused before a server starts. A `dbname` query
// parameter is refused too: a driver lets it override the path, so a URL could name an e2e
// database in its path and connect to another.
export function e2eDatabaseUrl(configured: string | undefined, fallback: string): string {
  const url = configured?.trim() || fallback
  let name: string
  let override = false
  try {
    const parsed = new URL(url)
    name = parsed.pathname.replace(/^\//, '')
    override = parsed.searchParams.has('dbname')
  } catch {
    name = '(not a URL)'
  }
  if (override) {
    throw new Error('E2E_DATABASE_URL must not carry a dbname query: the path names the database')
  }
  if (!name.endsWith('_e2e')) {
    throw new Error(
      `E2E_DATABASE_URL must name a database ending in _e2e, not "${name}": the e2e suite must never touch the development database`,
    )
  }
  return url
}
