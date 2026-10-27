// The URL the e2e API connects to. A blank E2E_DATABASE_URL (an unset CI variable exported
// empty) must not reach the API: outside production it would fall back to the development
// database and the suite would write its accounts there. So a blank takes the default, and
// anything whose database is not `*_e2e` is refused before a server starts.
export function e2eDatabaseUrl(configured: string | undefined, fallback: string): string {
  const url = configured?.trim() || fallback
  let name: string
  try {
    name = new URL(url).pathname.replace(/^\//, '')
  } catch {
    name = '(not a URL)'
  }
  if (!name.endsWith('_e2e')) {
    throw new Error(
      `E2E_DATABASE_URL must name a database ending in _e2e, not "${name}": the e2e suite must never touch the development database`,
    )
  }
  return url
}
