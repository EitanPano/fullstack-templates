import { describe, expect, it } from 'vitest'

import { scaledLimit } from '../../server/middleware/rate-limit'

describe('scaledLimit', () => {
  it('refuses a scale below 1, above 1000 or not finite, so no value disables limiting', () => {
    for (const scale of [0, 0.5, -1, 1001, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => scaledLimit(10, scale)).toThrow(RangeError)
    }
  })

  it('leaves the limit alone at scale 1 and multiplies it above', () => {
    expect(scaledLimit(10, 1)).toBe(10)
    expect(scaledLimit(10, 100)).toBe(1000)
  })

  it('rounds a fractional result up, so a scale never lowers a limit', () => {
    expect(scaledLimit(3, 1.5)).toBe(5)
    expect(scaledLimit(10, 1.1)).toBe(11)
  })
})
