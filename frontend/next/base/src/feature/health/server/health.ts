import { api } from '@/lib/api/client'

import type { HealthView } from '../model'

// A feature loader: called by a page or layout on the server, never from the browser.
// Failures become a value the UI can render, not an exception that blanks the page, and
// the cause stays in the server log.
export async function getHealth(): Promise<HealthView> {
  try {
    const { data, response } = await api.GET('/api/health', { cache: 'no-store' })
    if (data === undefined) {
      return { reachable: false, reason: `API responded ${String(response.status)}` }
    }
    return { reachable: true, version: data.version, uptimeSeconds: data.uptimeSeconds }
  } catch (cause) {
    console.error('health: API unreachable', cause)
    return { reachable: false, reason: 'connection failed' }
  }
}
