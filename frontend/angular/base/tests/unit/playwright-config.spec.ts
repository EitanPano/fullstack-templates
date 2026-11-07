// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

async function load(variables: Record<string, string>) {
  vi.resetModules()
  for (const [name, value] of Object.entries(variables)) vi.stubEnv(name, value)
  return (await import('../../playwright.config')).default
}

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

describe('playwright.config.ts', () => {
  it('takes a blank E2E_BASE_URL as unset and starts its own servers', async () => {
    // A CI variable exported empty must not become the origin ('' would start servers on no URL).
    const config = await load({ E2E_BASE_URL: '   ', E2E_DATABASE_URL: 'postgres://u:p@h/app_e2e' })

    expect(config.use?.baseURL).toMatch(/^http:\/\/127\.0\.0\.1:\S+$/)
    expect(config.webServer).toBeDefined()
  })

  it('keeps an explicit E2E_BASE_URL and starts nothing', async () => {
    const config = await load({ E2E_BASE_URL: 'http://127.0.0.1:3000' })

    expect(config.use?.baseURL).toBe('http://127.0.0.1:3000')
    expect(config.webServer).toBeUndefined()
  })

  it('never retries, forbids .only, blocks service workers and keeps a trace on failure', async () => {
    const config = await load({ E2E_BASE_URL: 'http://127.0.0.1:3000' })

    expect(config.retries).toBe(0)
    expect(config.forbidOnly).toBe(true)
    expect(config.use?.serviceWorkers).toBe('block')
    expect(config.use?.trace).toBe('retain-on-failure')
  })

  it('routes the touch and desktop checks by tag, so no spec skips at run time', async () => {
    const config = await load({ E2E_BASE_URL: 'http://127.0.0.1:3000' })
    const project = (name: string) => config.projects?.find((p) => p.name === name)

    expect(config.projects?.map((p) => p.name)).toEqual(['phone', 'desktop'])
    expect(project('phone')?.grepInvert).toEqual(/@desktop/)
    expect(project('desktop')?.grepInvert).toEqual(/@phone/)
    expect(project('desktop')?.testMatch).toEqual(['**/shell.spec.ts', '**/screens.spec.ts'])
    expect(read('../e2e/shell.spec.ts')).not.toMatch(/\.skip\(/)
  })

  it('starts a fresh API and the built app, never a leftover server', async () => {
    const config = await load({ E2E_BASE_URL: '', E2E_DATABASE_URL: 'postgres://u:p@h/app_e2e' })
    const servers = [config.webServer ?? []].flat()

    expect(servers.length).toBeGreaterThanOrEqual(1)
    for (const server of servers) expect(server.reuseExistingServer).toBe(false)
    const app = servers.at(-1)
    expect(app?.command).toBe('bun run build && node scripts/e2e-static.mjs')
    expect(app?.timeout).toBe(300_000)
  })
})
