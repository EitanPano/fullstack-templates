import { useGetHealthQuery } from '@/services/health.api'

// The home screen. The route loader has already put the health read in the cache, so the hook
// answers at once and the page renders without a spinner.
export function Component() {
  const { data } = useGetHealthQuery()

  return (
    <>
      <h1>Home</h1>
      {data && <p>Version {data.version}</p>}
    </>
  )
}
