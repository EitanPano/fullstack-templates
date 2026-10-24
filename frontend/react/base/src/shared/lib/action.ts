// What a route action returns. Expected failures (validation, a domain rule, the API refusing)
// are values the UI shows with a toast; only unexpected errors throw and reach the route's
// error boundary.
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string }
