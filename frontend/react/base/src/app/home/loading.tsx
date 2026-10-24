// The HydrateFallback: shown while the route's loader runs on the first render.
export default function HomeLoading() {
  return (
    <div aria-busy="true">
      <p role="status">Loading…</p>
    </div>
  )
}
