// What every server action returns. Expected failures (validation, a domain rule, the API
// refusing) are values the UI shows with a toast; only unexpected errors throw and reach
// the nearest error.tsx.
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string }
