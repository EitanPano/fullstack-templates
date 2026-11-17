// The jobs Worker is a second deployment with its own wrangler.jsonc, but it reads the same D1
// databases as the Pages project. This proves the two files agree where they must, and that the
// job is one cron trigger with no secret in its file.
import { describe, expect, it } from 'vitest'

import { leakedSecrets, readConfig, type Environment } from '../support/jsonc'

const pages = readConfig('wrangler.jsonc')
const jobs = readConfig('workers/jobs/wrangler.jsonc')

function databases(config: { d1_databases?: Environment['d1_databases'] }) {
  return (config.d1_databases ?? []).map(({ binding, database_name, database_id }) => ({
    binding,
    database_name,
    database_id,
  }))
}

describe('workers/jobs/wrangler.jsonc', () => {
  it('has its own name, an entry, a compatibility date and nodejs_compat', () => {
    expect(jobs.name).toBe(`${pages.name}-jobs`)
    expect(jobs.main).toBe('index.ts')
    expect(jobs.compatibility_date).toBe(pages.compatibility_date)
    expect(jobs.compatibility_flags).toContain('nodejs_compat')
  })

  it('binds the same D1 database as the Pages project in every environment', () => {
    expect(databases(jobs)).toEqual(databases(pages))
    expect(databases(jobs.env.preview)).toEqual(databases(pages.env.preview))
    expect(databases(jobs.env.production)).toEqual(databases(pages.env.production))
    expect(databases(jobs)).toHaveLength(1)
  })

  it('names the migrations directory of the Pages project, so one folder migrates both', () => {
    for (const config of [jobs, jobs.env.preview, jobs.env.production]) {
      expect(config.d1_databases?.[0]?.migrations_dir).toBe('../../migrations')
    }
  })

  it('has exactly one cron trigger', () => {
    expect(jobs.triggers?.crons).toHaveLength(1)
    expect(jobs.triggers?.crons?.[0]?.trim().split(/\s+/)).toHaveLength(5)
  })

  it('holds no value for a key that looks like a secret', () => {
    expect(leakedSecrets(jobs, 'wrangler')).toEqual([])
  })
})
