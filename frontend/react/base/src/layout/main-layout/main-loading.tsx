// The group's HydrateFallback: shown while a page module or its loader is pending, inside the
// shell, so the header does not flash away.
export function MainLoading() {
  return <p role="status">Loading…</p>
}
