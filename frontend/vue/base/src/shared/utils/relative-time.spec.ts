import { describe, expect, it } from 'vitest'

import { relativeTime } from './relative-time'

const NOW = new Date('2026-11-06T12:00:00.000Z')
const NOW_ISO = NOW.toISOString()

describe('relativeTime', () => {
  it('formats the past in the largest fitting unit', () => {
    expect(relativeTime('2026-11-06T11:57:00.000Z', 'en', NOW)).toBe('3 minutes ago')
    expect(relativeTime('2026-11-06T09:00:00.000Z', 'en', NOW)).toBe('3 hours ago')
    expect(relativeTime('2026-11-04T12:00:00.000Z', 'en', NOW)).toBe('2 days ago')
    expect(relativeTime('2026-11-05T12:00:00.000Z', 'en', NOW)).toBe('yesterday')
  })

  it('formats the future and accepts a Date', () => {
    expect(relativeTime(new Date('2026-11-06T12:05:00.000Z'), 'en', NOW)).toBe('in 5 minutes')
  })

  it('says now for the same instant', () => {
    expect(relativeTime(NOW_ISO, 'en', NOW)).toBe('now')
  })

  it('uses the language it is given', () => {
    expect(relativeTime('2026-11-06T11:57:00.000Z', 'de', NOW)).toBe('vor 3 Minuten')
  })

  it('reads the clock when no now is given', () => {
    expect(relativeTime(new Date(Date.now() - 3 * 60_000), 'en')).toBe('3 minutes ago')
  })

  it('returns an empty string for empty or unreadable input', () => {
    expect(relativeTime(null, 'en', NOW)).toBe('')
    expect(relativeTime(undefined, 'en', NOW)).toBe('')
    expect(relativeTime('not a date', 'en', NOW)).toBe('')
  })
})
