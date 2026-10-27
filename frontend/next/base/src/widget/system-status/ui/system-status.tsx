import { unstable_rethrow } from 'next/navigation'
import { connection } from 'next/server'

import { getHealth } from '@/entity/health/server/health'
import { HealthBadge } from '@/entity/health/ui/health-badge'
import type { HealthView } from '@/entity/health/model'
import { RefreshHealthButton } from '@/feature/refresh-health/ui/refresh-health-button'
import { ActionError } from '@/shared/lib/action-error'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { ErrorState } from '@/shared/ui/pattern/error-state'

// A cached loader throws on failure; the widget turns that into a value its markup can branch
// on. Next's own control-flow errors (prerender, redirect) are not failures and pass through.
async function load(): Promise<{ health?: HealthView; failure?: string }> {
  try {
    return { health: await getHealth() }
  } catch (error) {
    unstable_rethrow(error)
    return { failure: error instanceof ActionError ? error.message : undefined }
  }
}

// A widget: an async Server Component, wrapped in Suspense by its page with
// `SystemStatusSkeleton` as the fallback. It is a request-time hole: `connection()` first, so the
// build never calls the API, then the cached loader, so repeat requests do not either.
export async function SystemStatus() {
  await connection()
  const { health, failure } = await load()
  return (
    <Card>
      <CardHeader>
        <CardTitle>System status</CardTitle>
        <CardAction>
          <RefreshHealthButton />
        </CardAction>
      </CardHeader>
      <CardContent>
        {health ? (
          <HealthBadge health={health} />
        ) : (
          <ErrorState title="API unreachable" description={failure} />
        )}
      </CardContent>
    </Card>
  )
}
