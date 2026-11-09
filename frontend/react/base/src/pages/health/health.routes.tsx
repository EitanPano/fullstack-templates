import type { RouteObject } from 'react-router'

import { healthApi } from '@/services/health.api'
import type { AppStore } from '@/store'

// The index route. The loader prefetches the read so the group's fallback covers the wait and the
// page's hook finds the entry in the cache: one request. It unsubscribes at once; the entry
// stays for the cache's keep-unused window, long enough for the page to subscribe.
export function healthRoutes(store: AppStore): RouteObject[] {
  return [
    {
      index: true,
      loader: async () => {
        const subscription = store.dispatch(healthApi.endpoints.getHealth.initiate())
        try {
          return await subscription.unwrap()
        } finally {
          subscription.unsubscribe()
        }
      },
      lazy: () => import('./home-page'),
    },
  ]
}
