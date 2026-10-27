import { afterEach, describe, expect, it, vi } from 'vitest'

import { externalBaseUrl } from '../../scripts/e2e-base-url'

describe('externalBaseUrl', () => {
  it('is the trimmed origin when one is set', () => {
    expect(externalBaseUrl('http://localhost:8080')).toBe('http://localhost:8080')
    expect(externalBaseUrl('  http://localhost:8080  ')).toBe('http://localhost:8080')
  })

  it('is undefined when the variable is unset, empty or blank', () => {
    expect(externalBaseUrl(undefined)).toBeUndefined()
    expect(externalBaseUrl('')).toBeUndefined()
    expect(externalBaseUrl('   ')).toBeUndefined()
  })
})

// An unset CI variable exported empty must start the suite's own servers, not run against ''.
// The first import of the config loads Playwright, which can pass 5 s on a busy machine.
const LOAD = 30_000

describe('playwright.config.ts', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it(
    'treats a blank E2E_BASE_URL as unset',
    async () => {
      vi.resetModules()
      vi.stubEnv('E2E_BASE_URL', '  ')
      const { default: config } = await import('../../playwright.config')

      expect(config.webServer).toBeDefined()
      expect(config.use?.baseURL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    },
    LOAD,
  )

  it(
    'targets a set origin and starts nothing',
    async () => {
      vi.resetModules()
      vi.stubEnv('E2E_BASE_URL', 'http://localhost:8080')
      const { default: config } = await import('../../playwright.config')

      expect(config.webServer).toBeUndefined()
      expect(config.use?.baseURL).toBe('http://localhost:8080')
    },
    LOAD,
  )
})
