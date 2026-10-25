import { refreshHealth } from '@/feature/health/server/action'
import { getHealth } from '@/feature/health/server/health'
import { HealthStatus } from '@/feature/health/ui/health-status'
import { RefreshButton } from '@/feature/health/ui/refresh-button'

// A page composes feature components and calls feature loaders; nothing else lives here.
export default async function HomePage() {
  const health = await getHealth()
  return (
    <>
      <h1 className="text-2xl font-semibold">Home</h1>
      <p>Replace this page with the first feature.</p>
      <HealthStatus health={health} />
      <RefreshButton action={refreshHealth} />
    </>
  )
}
