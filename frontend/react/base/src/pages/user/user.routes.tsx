import type { RouteObject } from 'react-router'

import { requireAccount, returnToOf } from '@/core/auth/guards'
import type { AppStore } from '@/store'

// The guarded-page example: a visitor goes to sign-in with this page's path, and sign-in brings
// them back. The guard also fills the `getMe` cache the page's hook reads. Copy this route for
// the next signed-in screen.
export function userRoutes(store: AppStore): RouteObject[] {
  return [
    {
      path: 'profile',
      loader: ({ request }) => requireAccount(store, returnToOf(request)),
      lazy: () => import('./profile-page/profile-page'),
    },
  ]
}
