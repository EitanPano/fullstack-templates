import { useLoaderData } from 'react-router'

import type { HealthView } from '@/feature/health/model'
import { HealthStatus } from '@/feature/health/ui/health-status'
import { RefreshButton } from '@/feature/health/ui/refresh-button'

// A page composes feature components and reads its loader's data; nothing else lives here.
export default function HomePage() {
  const health = useLoaderData<HealthView>()
  return (
    <>
      <h1 className="text-3xl font-semibold">__PROJECT_NAME__</h1>
      <p>Replace this page with the first feature.</p>
      <HealthStatus health={health} />
      <RefreshButton />
    </>
  )
}
