// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// The layout mirrors through logical properties; a physical one would stay put under dir="rtl".
describe('the styles tree', () => {
  // styles.scss and its partials, and every sheet beside a page or component.
  const dir = fileURLToPath(new URL('../../src/', import.meta.url))
  const files = (readdirSync(dir, { recursive: true }) as string[]).filter((name) =>
    name.endsWith('.scss'),
  )
  const PHYSICAL =
    /(^|[\s{;])(left|right)\s*:|(margin|padding|border)-(left|right)|text-align:\s*(left|right)|float:\s*(left|right)/

  it('has files to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files)('%s uses no physical left or right property', (name) => {
    const source = readFileSync(`${dir}${name}`, 'utf8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')

    expect(source).not.toMatch(PHYSICAL)
  })
})
