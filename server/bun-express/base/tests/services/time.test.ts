import { describe, expect, it } from 'bun:test'

import { addDuration, isExpired, parseDuration, toIso } from '../../src/services/utils/time'

describe('parseDuration', () => {
  it('converts every unit to milliseconds', () => {
    expect(parseDuration('5ms')).toBe(5)
    // Zero is a valid duration (an immediate expiry), not an error.
    expect(parseDuration('0s')).toBe(0)
    expect(parseDuration('2s')).toBe(2000)
    expect(parseDuration('15m')).toBe(900_000)
    expect(parseDuration('1h')).toBe(3_600_000)
    expect(parseDuration('30d')).toBe(2_592_000_000)
  })

  it.each(['', '15', 'm', '-5m', '1.5h', '10w', '5 m', ' 5m', '5M'])('rejects %p', (text) => {
    expect(() => parseDuration(text)).toThrow(Error)
  })
})

describe('addDuration', () => {
  it('returns a new date shifted by the duration', () => {
    const start = new Date('2026-01-01T00:00:00.000Z')

    const later = addDuration(start, '10m')

    expect(later.toISOString()).toBe('2026-01-01T00:10:00.000Z')
    expect(later).not.toBe(start)
    expect(start.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('throws on an invalid duration', () => {
    expect(() => addDuration(new Date(), 'soon')).toThrow(Error)
  })
})

describe('isExpired', () => {
  const now = new Date('2026-01-01T12:00:00.000Z')

  it('is true before now, and at equality', () => {
    expect(isExpired(new Date('2026-01-01T11:59:59.999Z'), now)).toBe(true)
    expect(isExpired(new Date(now), now)).toBe(true)
  })

  it('is false after now', () => {
    expect(isExpired(new Date('2026-01-01T12:00:00.001Z'), now)).toBe(false)
  })

  it('defaults now to the current time', () => {
    expect(isExpired(new Date(Date.now() - 1000))).toBe(true)
    expect(isExpired(new Date(Date.now() + 60_000))).toBe(false)
  })
})

describe('toIso', () => {
  it('formats as an ISO 8601 string', () => {
    expect(toIso(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)))).toBe('2026-01-02T03:04:05.000Z')
  })
})
