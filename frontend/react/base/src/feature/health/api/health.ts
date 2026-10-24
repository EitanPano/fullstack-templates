import { client } from '@/lib/api/client'

import type { HealthView } from '../model'

// A route loader. A non-2xx answer and a network failure (fetch rejects) both end up thrown:
// the route's ErrorBoundary renders them and logs the cause. Return a value instead only for
// an outcome the page renders as part of its normal view.
export async function loadHealth(): Promise<HealthView> {
  const { data, response } = await client.GET('/api/health')
  if (data === undefined) throw new Error(`API responded ${String(response.status)}`)
  return { version: data.version, uptimeSeconds: data.uptimeSeconds }
}
