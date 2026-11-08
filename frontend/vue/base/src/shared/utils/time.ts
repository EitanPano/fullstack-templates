export type TimeUnit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// Largest first; a difference takes the first unit it reaches at least once. A month is 30 days
// and a year 365: coarse on purpose, this feeds "3 months ago", not a calendar.
const UNITS: readonly (readonly [TimeUnit, number])[] = [
  ['year', 365 * DAY],
  ['month', 30 * DAY],
  ['week', 7 * DAY],
  ['day', DAY],
  ['hour', HOUR],
  ['minute', MINUTE],
]

// A Date or an ISO 8601 string to a valid Date; null for anything unreadable.
export function parseTime(value: string | Date): Date | null {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

// `target` minus `now` in the largest unit that fits, rounded toward zero: negative is the past.
// Under a minute it is seconds.
export function differenceIn(target: Date, now: Date): { value: number; unit: TimeUnit } {
  const ms = target.getTime() - now.getTime()
  const size = Math.abs(ms)
  for (const [unit, length] of UNITS) {
    if (size >= length) return { value: Math.trunc(ms / length), unit }
  }
  return { value: Math.trunc(ms / SECOND), unit: 'second' }
}

// True when both fall on the same calendar day in the machine's zone.
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}
