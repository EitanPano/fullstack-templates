import { describe, expect, it } from 'bun:test'

import {
  assertE2eDatabase,
  databaseName,
  maintenanceUrl,
  quoteIdentifier,
  truncateStatement,
} from '../../src/infra/scripts/e2e-db'

// The pure parts of `bun run db:e2e`; the script itself needs a server and runs from the
// project's e2e proof.
describe('databaseName', () => {
  it('reads the name from the path and decodes it', () => {
    expect(databaseName('postgres://app:app@127.0.0.1:5432/app_e2e')).toBe('app_e2e')
    expect(databaseName('postgres://app:app@db/my%5Fe2e?sslmode=disable')).toBe('my_e2e')
  })

  it('gives an empty name for a URL without one or a value that is not a URL', () => {
    expect(databaseName('postgres://app:app@127.0.0.1:5432')).toBe('')
    expect(databaseName('not a url')).toBe('')
  })
})

describe('assertE2eDatabase', () => {
  it('returns the name of a database ending in _e2e', () => {
    expect(assertE2eDatabase('postgres://app:app@127.0.0.1:5432/app_e2e')).toBe('app_e2e')
  })

  it('refuses the development, test and maintenance databases and a missing name', () => {
    for (const name of ['app', 'app_test', 'postgres', 'app_e2e_old', '']) {
      expect(() => assertE2eDatabase(`postgres://app:app@127.0.0.1:5432/${name}`)).toThrow(/_e2e/)
    }
  })

  it('does not echo the URL, which holds the password', () => {
    const attempt = () => assertE2eDatabase('postgres://app:hunter2@db.internal:5432/app')

    expect(attempt).toThrow(/"app"/)
    expect(attempt).not.toThrow(/hunter2/)
  })

  it('refuses a value that is not a URL', () => {
    expect(() => assertE2eDatabase('hunter2')).toThrow(/_e2e/)
  })

  it('refuses a query that overrides the database, whatever the path says', () => {
    for (const query of ['dbname=app', 'DBNAME=app', 'sslmode=disable&dbname=app']) {
      const attempt = () =>
        assertE2eDatabase(`postgres://app:hunter2@127.0.0.1:5432/app_e2e?${query}`)

      expect(attempt).toThrow(/dbname/)
      expect(attempt).not.toThrow(/hunter2/)
    }
  })

  it('accepts a query that does not touch the database', () => {
    expect(assertE2eDatabase('postgres://app:app@db/app_e2e?sslmode=disable')).toBe('app_e2e')
  })
})

describe('maintenanceUrl', () => {
  it('points the same credentials and host at the postgres database', () => {
    expect(maintenanceUrl('postgres://app:secret@db.internal:5433/app_e2e')).toBe(
      'postgres://app:secret@db.internal:5433/postgres',
    )
  })

  it('keeps the query string', () => {
    expect(maintenanceUrl('postgres://app:app@127.0.0.1:5432/app_e2e?sslmode=disable')).toBe(
      'postgres://app:app@127.0.0.1:5432/postgres?sslmode=disable',
    )
  })
})

describe('quoteIdentifier', () => {
  it('double-quotes an identifier and doubles a quote inside it', () => {
    expect(quoteIdentifier('app_e2e')).toBe('"app_e2e"')
    expect(quoteIdentifier('we"ird')).toBe('"we""ird"')
  })
})

describe('truncateStatement', () => {
  it('truncates every table in one statement, quoted', () => {
    expect(truncateStatement(['user', 'session'])).toBe(
      'truncate table "user", "session" restart identity cascade',
    )
  })

  it('leaves the migration record out', () => {
    expect(truncateStatement(['schema_migration', 'user'])).toBe(
      'truncate table "user" restart identity cascade',
    )
  })

  it('has nothing to run when only the migration record is there', () => {
    expect(truncateStatement(['schema_migration'])).toBeUndefined()
    expect(truncateStatement([])).toBeUndefined()
  })
})
