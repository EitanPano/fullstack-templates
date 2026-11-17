import { describe, expect, it } from 'vitest'

import { addDuration, isExpired, parseDuration, toIso } from '../../server/services/utils/time'

describe('parseDuration', () => {
  it('converts every unit to milliseconds', () => {
    expect(parseDuration('5ms')).toBe(5)
    expect(parseDuration('2s')).toBe(2000)
    expect(parseDuration('15m')).toBe(900_000)
    expect(parseDuration('1h')).toBe(3_600_000)
    expect(parseDuration('30d')).toBe(2_592_000_000)
  })

  it('throws on anything that is not <integer><unit>', () => {
    expect(() => parseDuration('15')).toThrow('invalid duration')
    expect(() => parseDuration('1.5h')).toThrow('invalid duration')
    expect(() => parseDuration('')).toThrow('invalid duration')
  })
})

describe('addDuration', () => {
  it('returns a new date shifted by the duration', () => {
    const start = new Date('2026-01-01T00:00:00.000Z')
    expect(addDuration(start, '1h').toISOString()).toBe('2026-01-01T01:00:00.000Z')
    expect(start.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('isExpired and toIso', () => {
  const now = new Date('2026-01-01T00:00:00.000Z')

  it('is true before now and at equality, false after', () => {
    expect(isExpired(new Date(now.getTime() - 1), now)).toBe(true)
    expect(isExpired(now, now)).toBe(true)
    expect(isExpired(new Date(now.getTime() + 1), now)).toBe(false)
  })

  it('formats as an ISO 8601 string', () => {
    expect(toIso(now)).toBe('2026-01-01T00:00:00.000Z')
  })
})
