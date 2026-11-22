// wrangler.jsonc is the one file that says what each environment of the Worker runs on. Bindings
// and vars are not inherited, so this proves the three agree where they must and differ where they
// must, that the package is one Worker with static assets and nothing of Pages, and that no secret
// was written into the file.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { leakedSecrets, readConfig } from '../support/jsonc'

const root = path.resolve(import.meta.dirname, '../..')
const config = readConfig('wrangler.jsonc')
const environments = {
  development: config,
  preview: config.env.preview,
  production: config.env.production,
}

// The text files of the package, without what is installed, generated or built.
const SKIPPED = new Set(['node_modules', '.wrangler', '.e2e-state', 'dist', '.git'])
const TEXT = /\.(ts|mjs|json|jsonc|md|yaml|yml|txt|sql|example)$|^\.[\w.]+$/
function textFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIPPED.has(entry.name)) return []
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) return textFiles(file)
    return TEXT.test(entry.name) && entry.name !== 'bun.lock' ? [file] : []
  })
}

describe('wrangler.jsonc, one Worker with static assets', () => {
  it('turns on nodejs_compat and names the Worker entry', () => {
    expect(config.compatibility_flags).toContain('nodejs_compat')
    expect(config.main).toBe('server/index.ts')
    expect(existsSync(path.join(root, config.main ?? 'missing'))).toBe(true)
  })

  // @nofrontends-start
  it('serves dist as assets under ASSETS, runs the Worker first for /api/* only, and has a 404 page', () => {
    expect(config.assets).toEqual({
      directory: 'dist',
      binding: 'ASSETS',
      not_found_handling: '404-page',
      run_worker_first: ['/api/*'],
    })
  })

  it('has no host map: FRONTEND_HOSTS is in no environment', () => {
    for (const environment of Object.values(environments)) {
      expect(environment.vars).not.toHaveProperty('FRONTEND_HOSTS')
    }
    expect(readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8')).not.toContain('FRONTEND_HOSTS')
  })
  // @nofrontends-end
  // @frontends-start
  it('serves dist as assets under ASSETS, runs the Worker first for every request, and has a 404 page', () => {
    expect(config.assets).toEqual({
      directory: 'dist',
      binding: 'ASSETS',
      not_found_handling: '404-page',
      run_worker_first: true,
    })
  })

  it('maps every frontend to its local host in development, written out and not computed', () => {
    const dirs = (JSON.parse('__FRONTENDS__') as { dir: string }[]).map((frontend) => frontend.dir)
    expect(environments.development.vars?.FRONTEND_HOSTS).toBe(
      dirs.map((dir) => `${dir}.localhost=${dir}`).join(','),
    )
  })

  it('carries FRONTEND_HOSTS empty in preview and production, with a comment telling the deployer to set it', () => {
    expect(environments.preview.vars?.FRONTEND_HOSTS).toBe('')
    expect(environments.production.vars?.FRONTEND_HOSTS).toBe('')
    const text = readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8')
    expect(text.match(/FRONTEND_HOSTS is empty on purpose/g)).toHaveLength(2)
  })
  // @frontends-end

  it('has no Pages key, no functions/ directory and no Pages command anywhere in the package', () => {
    expect(Object.keys(config)).not.toContain('pages_build_output_dir')
    expect(existsSync(path.join(root, 'functions'))).toBe(false)
    expect(existsSync(path.join(root, 'static', '_routes.json'))).toBe(false)
    const command = ['wrangler', 'pages'].join(' ')
    const found = textFiles(root).filter((file) => readFileSync(file, 'utf8').includes(command))
    expect(found.map((file) => path.relative(root, file))).toEqual([])
  })

  it('keeps a cron trigger only with a scheduled handler, and no second Worker', () => {
    const entry = readFileSync(path.join(root, 'server/index.ts'), 'utf8')
    expect(Boolean(config.triggers?.crons?.length)).toBe(/async scheduled\(/.test(entry))
    expect(existsSync(path.join(root, 'workers'))).toBe(false)
  })

  it('has generated types that name each variable of every environment, FRONTEND_HOSTS included only when set', () => {
    const types = readFileSync(path.join(root, 'worker-configuration.d.ts'), 'utf8')
    const named = (name: string) => new RegExp(`\\b${name}: string;`).test(types)
    for (const environment of Object.values(environments)) {
      expect(named('ENVIRONMENT')).toBe(environment.vars?.ENVIRONMENT !== undefined)
      expect(named('FRONTEND_HOSTS')).toBe(Object.hasOwn(environment.vars ?? {}, 'FRONTEND_HOSTS'))
    }
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
