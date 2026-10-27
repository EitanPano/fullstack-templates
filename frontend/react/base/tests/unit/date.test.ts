import { describe, expect, it } from 'vitest'

import {
  dayKey,
  formatDate,
  formatDateTime,
  instantToWallTime,
  wallTimeToInstant,
} from '@/shared/lib/date'

// Europe/London changes on 2026-03-29 (01:00 GMT jumps to 02:00 BST) and on 2026-10-25 (02:00 BST
// falls back to 01:00 GMT), so one zone covers a gap, an ambiguous hour and the plain case.
const LONDON = 'Europe/London'

describe('wallTimeToInstant', () => {
  it('converts a plain wall time using the zone offset (GMT in winter, BST in summer)', () => {
    expect(wallTimeToInstant('2026-01-15T09:30', LONDON)).toEqual({
      ok: true,
      instant: new Date('2026-01-15T09:30:00Z'),
    })
    expect(wallTimeToInstant('2026-07-15T09:30', LONDON)).toEqual({
      ok: true,
      instant: new Date('2026-07-15T08:30:00Z'),
    })
  })

  it('converts the same wall time to different instants in different zones', () => {
    const result = wallTimeToInstant('2026-07-15T09:30', 'America/New_York')
    expect(result).toEqual({ ok: true, instant: new Date('2026-07-15T13:30:00Z') })
  })

  it('accepts seconds', () => {
    expect(wallTimeToInstant('2026-01-15T09:30:45', LONDON)).toEqual({
      ok: true,
      instant: new Date('2026-01-15T09:30:45Z'),
    })
  })

  it('refuses a time inside the spring-forward gap', () => {
    expect(wallTimeToInstant('2026-03-29T01:30', LONDON)).toEqual({ ok: false, reason: 'gap' })
    expect(wallTimeToInstant('2026-03-29T01:00', LONDON)).toEqual({ ok: false, reason: 'gap' })
  })

  it('accepts the minute before the gap and the first minute after it', () => {
    expect(wallTimeToInstant('2026-03-29T00:59', LONDON)).toEqual({
      ok: true,
      instant: new Date('2026-03-29T00:59:00Z'),
    })
    expect(wallTimeToInstant('2026-03-29T02:00', LONDON)).toEqual({
      ok: true,
      instant: new Date('2026-03-29T01:00:00Z'),
    })
  })

  it('takes the earlier instant for an ambiguous time in the fall-back hour', () => {
    // 01:30 happens twice on 2026-10-25: 00:30Z (BST) and 01:30Z (GMT). The earlier one wins.
    expect(wallTimeToInstant('2026-10-25T01:30', LONDON)).toEqual({
      ok: true,
      instant: new Date('2026-10-25T00:30:00Z'),
    })
  })

  it('converts the times either side of the ambiguous hour unambiguously', () => {
    expect(wallTimeToInstant('2026-10-25T00:59', LONDON)).toEqual({
      ok: true,
      instant: new Date('2026-10-24T23:59:00Z'),
    })
    expect(wallTimeToInstant('2026-10-25T02:00', LONDON)).toEqual({
      ok: true,
      instant: new Date('2026-10-25T02:00:00Z'),
    })
  })

  it('refuses text that is not a wall time or not a real date', () => {
    expect(wallTimeToInstant('', LONDON)).toEqual({ ok: false, reason: 'invalid' })
    expect(wallTimeToInstant('tomorrow', LONDON)).toEqual({ ok: false, reason: 'invalid' })
    expect(wallTimeToInstant('2026-02-30T10:00', LONDON)).toEqual({ ok: false, reason: 'invalid' })
    expect(wallTimeToInstant('2026-01-15T25:00', LONDON)).toEqual({ ok: false, reason: 'invalid' })
    expect(wallTimeToInstant('2026-01-15 09:30', LONDON)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('refuses a time zone that does not exist instead of throwing', () => {
    expect(wallTimeToInstant('2026-01-15T09:30', 'Mars/Olympus')).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })
})

describe('instantToWallTime', () => {
  it('formats an instant as the wall time in the zone', () => {
    expect(instantToWallTime('2026-07-15T08:30:00Z', LONDON)).toBe('2026-07-15T09:30')
    expect(instantToWallTime(new Date('2026-01-15T09:30:00Z'), LONDON)).toBe('2026-01-15T09:30')
  })

  it('round-trips both instants of the ambiguous hour', () => {
    expect(instantToWallTime('2026-10-25T00:30:00Z', LONDON)).toBe('2026-10-25T01:30')
    expect(instantToWallTime('2026-10-25T01:30:00Z', LONDON)).toBe('2026-10-25T01:30')
  })
})

describe('instantToWallTime with an unknown zone or instant', () => {
  it('returns undefined instead of throwing', () => {
    expect(instantToWallTime('2026-07-15T08:30:00Z', 'Mars/Olympus')).toBeUndefined()
    expect(instantToWallTime('not a date', LONDON)).toBeUndefined()
  })
})

describe('dayKey', () => {
  it('names the calendar day in the zone, not in UTC', () => {
    expect(dayKey('2026-07-14T23:30:00Z', LONDON)).toBe('2026-07-15')
    expect(dayKey('2026-07-14T23:30:00Z', 'UTC')).toBe('2026-07-14')
  })

  it('keeps one key for the 23 and the 25 hour days around the changes', () => {
    expect(dayKey('2026-03-28T23:59:00Z', LONDON)).toBe('2026-03-28')
    expect(dayKey('2026-03-29T00:00:00Z', LONDON)).toBe('2026-03-29')
    expect(dayKey('2026-03-29T22:59:00Z', LONDON)).toBe('2026-03-29')
    expect(dayKey('2026-03-29T23:00:00Z', LONDON)).toBe('2026-03-30')
  })
})

describe('formatDate and formatDateTime', () => {
  it('formats in the zone with the default patterns', () => {
    expect(formatDate('2026-07-14T23:30:00Z', LONDON)).toBe('15 Jul 2026')
    expect(formatDateTime('2026-07-14T23:30:00Z', LONDON)).toBe('15 Jul 2026, 00:30')
  })

  it('accepts a date-fns pattern', () => {
    expect(formatDate('2026-07-14T23:30:00Z', LONDON, 'yyyy/MM/dd')).toBe('2026/07/15')
  })
})
