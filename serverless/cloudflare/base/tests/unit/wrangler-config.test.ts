// wrangler.jsonc is the one file that says what each Pages environment runs on. Pages
// environments do not inherit bindings, so this proves the three agree where they must and differ
// where they must, and that no secret was written into the file.
import { describe, expect, it } from 'vitest'

import { leakedSecrets, readConfig } from '../support/jsonc'

const config = readConfig('wrangler.jsonc')
const environments = {
  development: config,
  preview: config.env.preview,
  production: config.env.production,
}

describe('wrangler.jsonc', () => {
  it('turns on nodejs_compat and builds into dist', () => {
    expect(config.compatibility_flags).toContain('nodejs_compat')
    expect(config.pages_build_output_dir).toBe('dist')
  })

  it('sets ENVIRONMENT in each environment', () => {
    expect(environments.development.vars?.ENVIRONMENT).toBe('development')
    expect(environments.preview.vars?.ENVIRONMENT).toBe('preview')
    expect(environments.production.vars?.ENVIRONMENT).toBe('production')
  })

  it('binds DB with migrations in every environment, each to a database of its own', () => {
    const names = Object.values(environments).map((environment) => {
      const databases = environment.d1_databases ?? []
      expect(databases).toHaveLength(1)
      expect(databases[0]?.binding).toBe('DB')
      expect(databases[0]?.migrations_dir).toBe('migrations')
      return databases[0]?.database_name
    })
    expect(new Set(names).size).toBe(3)
    const ids = Object.values(environments).map((e) => e.d1_databases?.[0]?.database_id)
    expect(new Set(ids).size).toBe(3)
  })

  it('keeps preview and production on different databases, so a preview never reads production data', () => {
    expect(environments.preview.d1_databases?.[0]?.database_name).not.toBe(
      environments.production.d1_databases?.[0]?.database_name,
    )
  })

  it('holds no value for a key that looks like a secret', () => {
    expect(leakedSecrets(config, 'wrangler')).toEqual([])
  })
})

describe('the secret check', () => {
  it('names a key that looks like a secret and has a value, at any depth', () => {
    const leaky = {
      vars: { API_TOKEN: 'abc', LOG_LEVEL: 'info' },
      env: { production: { vars: { DB_PASSWORD: 'x' } } },
    }
    expect(leakedSecrets(leaky, 'root')).toEqual([
      'root.vars.API_TOKEN',
      'root.env.production.vars.DB_PASSWORD',
    ])
  })

  it('ignores a secret-looking key with no value', () => {
    expect(leakedSecrets({ vars: { API_TOKEN: '' } }, 'root')).toEqual([])
  })
})
