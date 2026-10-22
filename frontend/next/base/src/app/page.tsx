import { refreshHealth } from '@/feature/health/server/action'
import { getHealth } from '@/feature/health/server/health'
import { HealthStatus } from '@/feature/health/ui/health-status'
import { RefreshButton } from '@/feature/health/ui/refresh-button'

// A page composes feature components and calls feature loaders; nothing else lives here.
export default async function HomePage() {
  const health = await getHealth()
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-3xl font-semibold">__PROJECT_NAME__</h1>
      <p>Replace this page with the first feature from the backlog.</p>
      <HealthStatus health={health} />
      <RefreshButton action={refreshHealth} />
    </main>
  )
}
