import { cacheLife, cacheTag } from 'next/cache'

import { call } from '@/shared/api/call'
import { createApi } from '@/shared/api/client'
import { getApiHealth } from '@/shared/api/generated'

import type { HealthView } from '../model'

// An entity loader for public data: cached, tagged with the entity so an action can expire it
// with `updateTag('health')`, and with a lifetime. It throws on failure (a thrown loader is never
// cached) and has no try/catch of its own, so Next's prerender signals pass through; the widget
// that calls it renders the error state. Cookies and headers are forbidden in here: a per-user
// read is a different loader, uncached.
export async function getHealth(): Promise<HealthView> {
  'use cache'
  cacheTag('health')
  cacheLife('seconds')

  const { version, uptimeSeconds } = await call(getApiHealth({ client: createApi() }))
  return { version, uptimeSeconds }
}
