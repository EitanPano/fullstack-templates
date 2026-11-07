import { differenceIn, isSameDay, parseTime } from './time'

const NOW = new Date('2026-11-06T12:00:00.000Z')
const at = (ms: number) => new Date(NOW.getTime() + ms)
const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('parseTime', () => {
  it('reads an ISO string and copies a Date', () => {
    expect(parseTime('2026-11-06T12:00:00.000Z')?.getTime()).toBe(NOW.getTime())
    const copy = parseTime(NOW)
    expect(copy?.getTime()).toBe(NOW.getTime())
    expect(copy).not.toBe(NOW)
  })

  it('returns null for unreadable input', () => {
    expect(parseTime('nope')).toBeNull()
    expect(parseTime(new Date(Number.NaN))).toBeNull()
  })
})

describe('differenceIn', () => {
  it('picks the largest unit reached, rounding toward zero', () => {
    expect(differenceIn(at(-30 * SECOND), NOW)).toEqual({ value: -30, unit: 'second' })
    expect(differenceIn(at(-3 * MINUTE - 20 * SECOND), NOW)).toEqual({ value: -3, unit: 'minute' })
    expect(differenceIn(at(5 * HOUR), NOW)).toEqual({ value: 5, unit: 'hour' })
    expect(differenceIn(at(-2 * DAY), NOW)).toEqual({ value: -2, unit: 'day' })
    expect(differenceIn(at(-14 * DAY), NOW)).toEqual({ value: -2, unit: 'week' })
    expect(differenceIn(at(-60 * DAY), NOW)).toEqual({ value: -2, unit: 'month' })
    expect(differenceIn(at(800 * DAY), NOW)).toEqual({ value: 2, unit: 'year' })
  })

  it('is zero seconds for the same instant', () => {
    expect(differenceIn(NOW, NOW)).toEqual({ value: 0, unit: 'second' })
  })
})

describe('isSameDay', () => {
  it('compares the calendar day', () => {
    expect(isSameDay(new Date(2026, 10, 6, 0, 1), new Date(2026, 10, 6, 23, 59))).toBe(true)
    expect(isSameDay(new Date(2026, 10, 6, 23, 59), new Date(2026, 10, 7, 0, 1))).toBe(false)
    expect(isSameDay(new Date(2026, 10, 6), new Date(2025, 10, 6))).toBe(false)
  })
})
