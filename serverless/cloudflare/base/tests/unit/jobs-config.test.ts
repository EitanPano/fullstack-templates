// The `jobs` flag is a cron trigger and a `scheduled` handler in the one Worker: this proves the
// trigger is one valid cron expression, inherited by every environment (so each deployed Worker
// runs the job against its own database), and that no second Worker or second configuration exists.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { leakedSecrets, readConfig } from '../support/jsonc'

const root = path.resolve(import.meta.dirname, '../..')
const config = readConfig('wrangler.jsonc')

describe('the jobs flag', () => {
  it('has exactly one cron trigger of five fields at the top level', () => {
    expect(config.triggers?.crons).toHaveLength(1)
    expect(config.triggers?.crons?.[0]?.trim().split(/\s+/)).toHaveLength(5)
  })

  it('leaves the environments to inherit the trigger and the entry, so each runs its own database', () => {
    for (const environment of [config.env.preview, config.env.production]) {
      expect(environment).not.toHaveProperty('triggers')
      expect(environment).not.toHaveProperty('main')
      expect(environment.d1_databases).toHaveLength(1)
    }
  })

  it('exports a scheduled handler from the Worker entry', () => {
    expect(readFileSync(path.join(root, 'server/index.ts'), 'utf8')).toMatch(/async scheduled\(/)
  })

  it('has no second Worker and no second wrangler configuration', () => {
    expect(existsSync(path.join(root, 'workers'))).toBe(false)
    expect(existsSync(path.join(root, 'wrangler.toml'))).toBe(false)
  })

  it('holds no value for a key that looks like a secret', () => {
    expect(leakedSecrets(config, 'wrangler')).toEqual([])
  })
})
