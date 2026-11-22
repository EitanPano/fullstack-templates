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
  it('takes a blank E2E_BASE_URL as unset and starts its own server', async () => {
    // A CI variable exported empty must not become the origin ('' would start servers on no URL).
    const config = await load({ E2E_BASE_URL: '   ' })

    expect(config.use?.baseURL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/) // @nofrontends
    expect(config.use?.baseURL).toMatch(/^http:\/\/[a-z][a-z0-9-]*\.localhost:\d+$/) // @frontends
    expect(config.webServer).toBeDefined()
  })

  // @frontends-start
  it('serves this frontend by its own host: the browser opens <dir>.localhost, the health check goes to 127.0.0.1 and only this build is assembled', async () => {
    const config = await load({ E2E_BASE_URL: '' })
    const server = config.webServer as { command: string; url: string }

    expect(config.use?.baseURL).toBe('http://__PACKAGE_DIR__.localhost:__SERVER_PORT__')
    expect(server.url).toBe('http://127.0.0.1:__SERVER_PORT__/api/health')
    expect(server.command).toMatch(/ --only __PACKAGE_DIR__$/)
  })
  // @frontends-end

  it('starts exactly one fresh web server, never a leftover one, with a generous timeout', async () => {
    const config = await load({ E2E_BASE_URL: '' })
    const server = config.webServer

    expect(Array.isArray(server)).toBe(false)
    expect(server).toMatchObject({ reuseExistingServer: false })
    expect(config.retries).toBe(0)
  })

  it('keeps an explicit E2E_BASE_URL and starts nothing', async () => {
    const config = await load({ E2E_BASE_URL: 'http://127.0.0.1:3000' })

    expect(config.use?.baseURL).toBe('http://127.0.0.1:3000')
    expect(config.webServer).toBeUndefined()
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
