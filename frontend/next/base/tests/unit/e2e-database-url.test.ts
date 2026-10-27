import { afterEach, describe, expect, it, vi } from 'vitest'

import { e2eDatabaseUrl } from '../../scripts/e2e-database-url'

const DEFAULT = 'postgres://app:app@127.0.0.1:5432/app_e2e'

describe('e2eDatabaseUrl', () => {
  it('uses the configured *_e2e URL', () => {
    const url = 'postgres://u:p@db:5432/other_e2e'
    expect(e2eDatabaseUrl(url, DEFAULT)).toBe(url)
  })

  it('takes the default when the variable is unset, empty or blank', () => {
    expect(e2eDatabaseUrl(undefined, DEFAULT)).toBe(DEFAULT)
    expect(e2eDatabaseUrl('', DEFAULT)).toBe(DEFAULT)
    expect(e2eDatabaseUrl('   ', DEFAULT)).toBe(DEFAULT)
  })

  it('refuses a URL that is not an e2e database, whatever else its name contains', () => {
    for (const name of ['app', 'appe2e', 'app_e2e_old', 'e2e_app']) {
      expect(() => e2eDatabaseUrl(`postgres://app:app@127.0.0.1:5432/${name}`, DEFAULT)).toThrow(
        /ending in _e2e/,
      )
    }
  })

  it('words a malformed URL as the same refusal, not a bare Invalid URL', () => {
    expect(() => e2eDatabaseUrl('not a url', DEFAULT)).toThrow(/ending in _e2e/)
  })
})

// The config is the one place that decides whether the guard runs: only when Playwright starts
// its own API. Container mode (E2E_BASE_URL) never reads the variable.
describe('playwright.config.ts', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  async function load(env: Record<string, string>) {
    vi.resetModules()
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
    return import('../../playwright.config')
  }

  it('refuses a development database when it starts its own API', async () => {
    await expect(load({ E2E_BASE_URL: '', E2E_DATABASE_URL: 'postgres://u:p@h/app' })).rejects.toThrow(
      /ending in _e2e/,
    )
  })

  it('does not check the variable in container mode, which starts no API', async () => {
    const config = await load({
      E2E_BASE_URL: 'http://127.0.0.1:3000',
      E2E_DATABASE_URL: 'postgres://u:p@h/app',
    })
    expect(config.default.webServer).toBeUndefined()
  })
})
