import { describe, expect, it } from 'vitest'

import { formatPhone } from './phone'

describe('formatPhone', () => {
  it('groups a North American number', () => {
    expect(formatPhone('+14155550132')).toBe('+1 (415) 555-0132')
  })

  it('groups other numbers after their calling code', () => {
    expect(formatPhone('+442071838750')).toBe('+44 207 183 8750')
    expect(formatPhone('+972541234567')).toBe('+972 541 234 567')
    expect(formatPhone('+74951234567')).toBe('+7 495 123 4567')
  })

  it('returns anything that is not E.164 unchanged', () => {
    expect(formatPhone('055-123-4567')).toBe('055-123-4567')
    expect(formatPhone('+1 415')).toBe('+1 415')
    expect(formatPhone('hello')).toBe('hello')
  })

  it('returns an empty string for null and undefined', () => {
    expect(formatPhone(null)).toBe('')
    expect(formatPhone(undefined)).toBe('')
  })
})
