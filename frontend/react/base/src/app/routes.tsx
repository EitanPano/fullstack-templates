import { Outlet, type RouteObject } from 'react-router'

import { NAV } from '@/app/nav'
import RootError from '@/app/root-error'
import { authRoutes } from '@/pages/auth/auth.routes' // @server:auth
import { forbiddenRoutes } from '@/pages/forbidden/forbidden.routes' // @server:auth
import { healthRoutes } from '@/pages/health/health.routes'
import { notFoundRoutes } from '@/pages/not-found/not-found.routes'
import { userRoutes } from '@/pages/user/user.routes' // @server:auth
import { AppAuthError } from '@/components/app-auth-error' // @server:auth
import { AppAuthLayout } from '@/components/app-auth-layout' // @server:auth
import { AppAuthLoading } from '@/components/app-auth-loading' // @server:auth
import { AppMainError } from '@/components/app-main-error'
import { AppMainLayout } from '@/components/app-main-layout'
import { AppMainLoading } from '@/components/app-main-loading'
import type { AppStore } from '@/store'

// The route table: paths to components and loaders, nothing else. A route group is a pathless
// route with its own HydrateFallback (loading) and ErrorBoundary (error), nested inside the
// group's layout so a failure renders inside the shell. It is a function of the store so a test
// renders the table against its own.
export function createRoutes(store: AppStore): RouteObject[] {
  return [
    {
      path: '/',
      Component: Outlet,
      ErrorBoundary: RootError,
      children: [
        {
          element: <AppMainLayout nav={NAV} />,
          children: [
            {
              // React Router shows the nearest HydrateFallback at or above the first route whose
              // loader is still pending, so this one covers every page below it.
              HydrateFallback: AppMainLoading,
              ErrorBoundary: AppMainError,
              children: [
                ...healthRoutes(store),
                ...userRoutes(store), // @server:auth
                ...forbiddenRoutes(), // @server:auth
                ...notFoundRoutes(),
              ],
            },
          ],
        },
        // @server:auth-start
        {
          Component: AppAuthLayout,
          children: [
            {
              HydrateFallback: AppAuthLoading,
              ErrorBoundary: AppAuthError,
              children: authRoutes(store),
            },
          ],
        },
        // @server:auth-end
      ],
    },
  ]
}
