import { format } from 'date-fns'
import { tz, tzOffset } from '@date-fns/tz'

// Dates cross the wire as ISO instants. A person thinks in wall time in a named zone, so every
// conversion names the zone; nothing here reads the machine's zone.
export type WallTimeResult = { ok: true; instant: Date } | { ok: false; reason: 'invalid' | 'gap' }

const WALL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
const DAY_MS = 86_400_000

function offsetMs(timeZone: string, at: number): number {
  const minutes = tzOffset(timeZone, new Date(at))
  if (Number.isNaN(minutes)) throw new RangeError(`unknown time zone: ${timeZone}`)
  return minutes * 60_000
}

// 'yyyy-MM-ddTHH:mm[:ss]' in `timeZone` to an instant. A wall time the zone skips (the clocks
// jumped over it) is refused; one it shows twice (the clocks fell back) takes the earlier instant.
export function wallTimeToInstant(wall: string, timeZone: string): WallTimeResult {
  try {
    return convert(wall, timeZone)
  } catch (error) {
    // An unknown zone name is refused like unreadable text, so a form never crashes a render.
    if (error instanceof RangeError) return { ok: false, reason: 'invalid' }
    throw error
  }
}

function convert(wall: string, timeZone: string): WallTimeResult {
  const match = WALL_TIME.exec(wall)
  if (!match) return { ok: false, reason: 'invalid' }
  const [, y, mo, d, h, mi, sec] = match
  const parts = [y, mo, d, h, mi, sec ?? '0'].map(Number)
  const [year, month, day, hour, minute, second] = parts as [
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  // Date.UTC rolls an impossible date over (Feb 30 becomes Mar 2); reading it back catches that.
  const check = new Date(asUtc)
  const real =
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day &&
    check.getUTCHours() === hour &&
    check.getUTCMinutes() === minute
  if (!real) return { ok: false, reason: 'invalid' }

  // The wall time is valid at an instant when that instant's own offset maps back to it. The
  // offsets a day before and a day after bracket any single transition.
  const candidates = new Set(
    [offsetMs(timeZone, asUtc - DAY_MS), offsetMs(timeZone, asUtc + DAY_MS)].map(
      (offset) => asUtc - offset,
    ),
  )
  const valid = [...candidates].filter((at) => at + offsetMs(timeZone, at) === asUtc)
  if (valid.length === 0) return { ok: false, reason: 'gap' }
  return { ok: true, instant: new Date(Math.min(...valid)) }
}

// Undefined for an unknown zone or an unreadable instant, so a render never throws.
export function instantToWallTime(instant: Date | string, timeZone: string): string | undefined {
  try {
    return format(new Date(instant), "yyyy-MM-dd'T'HH:mm", { in: tz(timeZone) })
  } catch (error) {
    if (error instanceof RangeError) return undefined
    throw error
  }
}

// The calendar day an instant falls on in the zone, as 'yyyy-MM-dd': the key to group by.
export function dayKey(instant: Date | string, timeZone: string): string {
  return format(new Date(instant), 'yyyy-MM-dd', { in: tz(timeZone) })
}

export function formatDate(instant: Date | string, timeZone: string, pattern = 'd MMM yyyy') {
  return format(new Date(instant), pattern, { in: tz(timeZone) })
}

export function formatDateTime(
  instant: Date | string,
  timeZone: string,
  pattern = 'd MMM yyyy, HH:mm',
) {
  return format(new Date(instant), pattern, { in: tz(timeZone) })
}
