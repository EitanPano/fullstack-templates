import type { RouteObject } from 'react-router'

import { redirectIfSignedIn } from '@/core/auth/guards'
import type { AppStore } from '@/store'

// Sign-in and sign-up, for the auth layout. An account that is already signed in never sees
// them: the loader sends it home.
export function authRoutes(store: AppStore): RouteObject[] {
  return [
    {
      path: 'sign-in',
      loader: () => redirectIfSignedIn(store),
      lazy: () => import('./pages/sign-in-page'),
    },
    {
      path: 'sign-up',
      loader: () => redirectIfSignedIn(store),
      lazy: () => import('./pages/sign-up-page'),
    },
  ]
}
