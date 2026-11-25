import { expect, test } from '@playwright/test'

import { API_ORIGIN, CONFIG_URL, GLOBAL, LISTED_ORIGIN, MAJOR, SDK_KEY } from './hosts'
import { recorded, recorder, settle } from './support'

// The other specs load the test build, which carries the fixture module. This one loads the file
// a release ships (dist/cdn/v<major>/loader.js, served by the host fixture), which carries none:
// it installs its global, reads the kill switch, draws nothing, and refuses a module it does not
// have.
test('the shipped loader installs its global, reads the kill switch and draws nothing', async ({
  page,
}) => {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  await page.addInitScript(recorder)
  await page.goto(`${LISTED_ORIGIN}/blank.html`)
  const answered = page.waitForResponse(CONFIG_URL)
  await page.evaluate(
    ({ key, apiOrigin, name }) => {
      const events: unknown[] = []
      const win = window as unknown as Record<string, unknown>
      win['__events'] = events
      win[name] = [
        ['on', 'error', (event: unknown) => events.push(event)],
        ['on', 'closed', (event: unknown) => events.push(event)],
        ['init', { key, apiOrigin }],
      ]
      const script = document.createElement('script')
      script.src = '/shipped/loader.js'
      document.head.appendChild(script)
    },
    { key: SDK_KEY, apiOrigin: API_ORIGIN, name: GLOBAL },
  )
  expect((await answered).status()).toBe(200)
  await settle(page)
  const state = await page.evaluate((name) => {
    const win = window as unknown as Record<string, unknown>
    const sdk = win[name] as {
      version?: string
      mount(module: string, target: Element | null): { id: string }
    }
    // No module ships: a mount of any name is a refusal, and still nothing is drawn.
    const handle = sdk.mount('anything', document.body)
    return {
      members: Object.keys(sdk).sort(),
      version: sdk.version,
      handle: handle.id,
      iframes: document.querySelectorAll('iframe').length,
    }
  }, GLOBAL)
  expect(state.members).toEqual([
    'destroy',
    'init',
    'mount',
    'on',
    'open',
    'push',
    'setConsent',
    'setTheme',
    'version',
  ])
  expect(state.version).toMatch(new RegExp(`^${MAJOR}\\.`))
  // The refusal reaches the page after `mount` has returned the handle.
  const events = await page.evaluate(
    () => (window as unknown as Record<string, unknown>)['__events'],
  )
  expect(events).toEqual([
    { name: 'error', code: 'unknown_module', module: 'anything', unit: 'u1' },
  ])
  expect(state.handle).toBe('u1')
  expect(state.iframes).toBe(0)
  const logs = await recorded(page)
  expect(logs.flatMap((log) => [...log.violations, ...log.errors, ...log.rejections])).toEqual([])
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})
