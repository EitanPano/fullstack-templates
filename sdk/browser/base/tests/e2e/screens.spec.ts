import { mkdirSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import { LISTED_ORIGIN } from './hosts'
import { apiFrame, loadSdk, mountUnit, openUnit, unitProblems } from './support'
import { unitScreens } from './unit-screens'

// The screens QA reads: every entry of unit-screens.ts, mounted on a host page in light and in dark,
// in the project's viewport (`phone` and `desktop`; the engine projects do not run this spec).
// The host page takes its scheme from the query and the unit from the SDK's theme. Each screen is
// also checked inside the frame: no WCAG A/AA axe violation and no sideways scroll.
const SCHEMES = ['light', 'dark'] as const
const DIRECTORY = 'test-results/screens'

for (const screen of unitScreens) {
  for (const scheme of SCHEMES) {
    test(`${screen.name} in ${scheme}`, async ({ page }, info) => {
      const viewport = info.project.name
      await page.goto(`${LISTED_ORIGIN}/screen.html?scheme=${scheme}`)
      await loadSdk(page, { theme: { scheme } })
      if (screen.display === 'modal') await openUnit(page, screen)
      else await mountUnit(page, { module: screen.module, props: screen.props })
      await expect
        .poll(async () =>
          page.evaluate(() =>
            (window as unknown as { __sdkEvents: { name: string }[] }).__sdkEvents.map(
              (event) => event.name,
            ),
          ),
        )
        .toContain('rendered')
      if (screen.display === 'modal') {
        // The dialog is the viewport's size and the frame has no height of its own to report.
        await expect
          .poll(() => apiFrame(page)!.evaluate(() => document.activeElement !== document.body))
          .toBe(true)
        await screen.steps?.(apiFrame(page)!)
      } else {
        // The frame has reported its height once the iframe is the size of the frame's document.
        await expect
          .poll(async () => {
            const iframe = await page
              .locator('iframe')
              .evaluate((el) => Math.round(el.getBoundingClientRect().height))
            const content = await apiFrame(page)!.evaluate(() =>
              Math.ceil(document.documentElement.getBoundingClientRect().height),
            )
            return iframe === content
          })
          .toBe(true)
        await screen.steps?.(apiFrame(page)!)
      }

      mkdirSync(DIRECTORY, { recursive: true })
      await page.screenshot({
        path: `${DIRECTORY}/${screen.name}-${viewport}-${scheme}.png`,
        fullPage: true,
      })

      expect(await unitProblems(page), `${screen.name} (${scheme}, ${viewport})`).toEqual([])
      // A modal is over the page, not in it: the page must not grow sideways under it either.
      if (screen.display === 'modal') {
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          ),
          `${screen.name}: the host page overflows sideways`,
        ).toBe(true)
      }
    })
  }
}
