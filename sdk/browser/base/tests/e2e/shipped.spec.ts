import { expect, test } from '@playwright/test'

import { API_ORIGIN, CONFIG_URL, LISTED_ORIGIN, MAJOR, SDK_KEY } from './hosts'
import { recorded, recorder, settle } from './support'

// The other specs load the test build, which carries the fixture module. This one loads the file
// a release ships (dist/cdn/v<major>/loader.js, served by the host fixture), which carries none:
// it installs its global, reads the kill switch and draws nothing.
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
    ({ key, apiOrigin }) => {
      const events: unknown[] = []
      const win = window as unknown as Record<string, unknown>
      win['__events'] = events
      win['__SDK_GLOBAL__'] = [
        ['on', 'error', (event: unknown) => events.push(event)],
        ['init', { key, apiOrigin }],
      ]
      const script = document.createElement('script')
      script.src = '/shipped/loader.js'
      document.head.appendChild(script)
    },
    { key: SDK_KEY, apiOrigin: API_ORIGIN },
  )
  expect((await answered).status()).toBe(200)
  await settle(page)
  const state = await page.evaluate(() => {
    const win = window as unknown as Record<string, unknown>
    return {
      members: Object.keys((win['__SDK_GLOBAL__'] as object) ?? {}).sort(),
      version: (win['__SDK_GLOBAL__'] as { version?: string }).version,
      events: win['__events'],
      iframes: document.querySelectorAll('iframe').length,
    }
  })
  expect(state.members).toEqual(['destroy', 'init', 'on', 'setConsent', 'version'])
  expect(state.version).toMatch(new RegExp(`^${MAJOR}\\.`))
  expect(state.events).toEqual([])
  expect(state.iframes).toBe(0)
  const logs = await recorded(page)
  expect(logs.flatMap((log) => [...log.violations, ...log.errors, ...log.rejections])).toEqual([])
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})
