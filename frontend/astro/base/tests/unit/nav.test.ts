// src/nav.ts is the one table of top-level routes: the e2e screen list reads it, so every entry
// must be a real page.
import { existsSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { NAV } from '../../src/nav'

// The page file a path is served from (build.format: 'file': /about is src/pages/about.astro).
const pageOf = (route: string) => `src/pages/${route === '/' ? 'index' : route.slice(1)}.astro`

describe('nav', () => {
  it('lists the index route', () => {
    expect(NAV.map((entry) => entry.path)).toContain('/')
  })

  it('has unique, absolute, clean paths with a label each', () => {
    const paths = NAV.map((entry) => entry.path)
    expect(new Set(paths).size).toBe(paths.length)
    for (const entry of NAV) {
      expect(entry.path).toMatch(/^\/[a-z0-9/-]*$/)
      expect(entry.path === '/' || !entry.path.endsWith('/')).toBe(true)
      expect(entry.label.trim()).not.toBe('')
    }
  })

  it('points every entry at a page file', () => {
    for (const entry of NAV) expect(existsSync(pageOf(entry.path)), entry.path).toBe(true)
  })
})
