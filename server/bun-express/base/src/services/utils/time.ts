// Pure time helpers. Durations are written as '<integer><unit>' strings in config/constants.ts
// ('15m', '30d') so policy reads like prose; this is the one place that turns them into
// milliseconds. Nothing here reads the clock except the default of isExpired's `now`.
const UNIT_MS = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const

export function parseDuration(text: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(text)
  const amount = match?.[1]
  const unit = match?.[2]
  if (amount === undefined || unit === undefined) {
    throw new Error(`invalid duration "${text}": expected <integer><ms|s|m|h|d>`)
  }
  return Number(amount) * UNIT_MS[unit as keyof typeof UNIT_MS]
}

export function addDuration(date: Date, text: string): Date {
  return new Date(date.getTime() + parseDuration(text))
}

export function isExpired(date: Date, now: Date = new Date()): boolean {
  return date.getTime() <= now.getTime()
}

export function toIso(date: Date): string {
  return date.toISOString()
}
