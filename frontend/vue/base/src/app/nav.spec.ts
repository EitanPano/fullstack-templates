import { describe, expect, it } from 'vitest'

import { NAV } from './nav'

describe('NAV', () => {
  it('has the home entry first, so the header name and the nav agree', () => {
    expect(NAV[0]?.path).toBe('/')
  })

  it('lists absolute paths with a label key each and no path twice', () => {
    for (const entry of NAV) {
      expect(entry.path.startsWith('/')).toBe(true)
      expect(entry.labelKey).not.toBe('')
    }
    expect(new Set(NAV.map((entry) => entry.path)).size).toBe(NAV.length)
  })
})
