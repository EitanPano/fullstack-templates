import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { LISTED_ORIGIN } from './hosts'
import { apiFrame, fixtureBlock, loadSdk, mountUnit } from './support'

// The frame draws on someone else's page, so what it draws must pass the same scan a frontend's
// screens do: no serious or critical axe violation in the host page or in the frame. The screens
// spec scans the frame against the WCAG A and AA tags for every screen of the package.
test('a page with the drawn frame has no serious accessibility violation', async ({ page }) => {
  await page.goto(`${LISTED_ORIGIN}/blank.html`)
  await loadSdk(page)
  await mountUnit(page, { props: { text: 'A unit', href: 'https://example.test/page' } })
  await expect(fixtureBlock(page)).toBeVisible()

  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target).join(', ')}`)

  expect(serious).toEqual([])
})

// The scan above is only worth its green if it reaches into the frame, so it is shown to fail on a
// fault planted there: an image with no text alternative.
test('the scan reaches into the frame: a planted fault is found', async ({ page }) => {
  await page.goto(`${LISTED_ORIGIN}/blank.html`)
  await loadSdk(page)
  await mountUnit(page, { props: { text: 'A unit' } })
  await expect(fixtureBlock(page)).toBeVisible()
  await apiFrame(page)!.evaluate(() => {
    const img = document.createElement('img')
    img.setAttribute('src', 'data:image/gif;base64,R0lGODlhAQABAAAAACw=')
    document.body.appendChild(img)
  })
  const results = await new AxeBuilder({ page }).include('iframe').analyze()
  expect(results.violations.map((violation) => violation.id)).toContain('image-alt')
})
