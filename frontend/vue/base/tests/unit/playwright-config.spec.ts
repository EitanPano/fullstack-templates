import { readdirSync, readFileSync } from 'node:fs'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

async function load(env: Record<string, string>) {
  vi.resetModules()
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
  return (await import('../../playwright.config')).default
}

describe('playwright.config.ts', () => {
  it('takes a blank E2E_BASE_URL as unset and starts its own servers', async () => {
    // A CI variable exported empty must not become the origin ('' would start servers on no URL).
    const config = await load({ E2E_BASE_URL: '   ', E2E_DATABASE_URL: 'postgres://u:p@h/app_e2e' })

    // In the template the port is still the generator's placeholder.
    expect(config.use?.baseURL).toMatch(/^http:\/\/127\.0\.0\.1:(\d+|__PORT__)$/)
    expect(config.webServer).toBeDefined()
  })

  it('keeps an explicit E2E_BASE_URL and starts nothing', async () => {
    const config = await load({ E2E_BASE_URL: 'http://127.0.0.1:3000' })

    expect(config.use?.baseURL).toBe('http://127.0.0.1:3000')
    expect(config.webServer).toBeUndefined()
  })

  it('blocks service workers, so a registered worker never serves a stale shell to a test', async () => {
    const config = await load({ E2E_BASE_URL: 'http://127.0.0.1:3000' })

    expect(config.use?.serviceWorkers).toBe('block')
  })

  it('routes the touch and desktop checks by tag, so no spec skips at run time', async () => {
    const config = await load({ E2E_BASE_URL: 'http://127.0.0.1:3000' })
    const project = (name: string) => config.projects?.find((p) => p.name === name)

    expect(project('phone')?.grepInvert).toEqual(/@desktop/)
    expect(project('desktop')?.grepInvert).toEqual(/@phone/)
    const specs = readdirSync('tests/e2e').filter((name) => name.endsWith('.spec.ts'))
    for (const spec of specs) {
      expect(readFileSync(`tests/e2e/${spec}`, 'utf8'), spec).not.toMatch(/\.skip\(/)
    }
  })
})
