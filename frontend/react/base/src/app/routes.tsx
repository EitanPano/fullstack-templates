import { Outlet, type RouteObject } from 'react-router'

import { NAV } from '@/app/nav'
import RootError from '@/app/root-error'
import { authRoutes } from '@/features/auth/auth.routes' // @server:auth
import { forbiddenRoutes } from '@/features/forbidden/forbidden.routes' // @server:auth
import { healthRoutes } from '@/features/health/health.routes'
import { notFoundRoutes } from '@/features/not-found/not-found.routes'
import { userRoutes } from '@/features/user/user.routes' // @server:auth
import { AuthError } from '@/layout/auth-layout/auth-error' // @server:auth
import { AuthLayout } from '@/layout/auth-layout/auth-layout' // @server:auth
import { AuthLoading } from '@/layout/auth-layout/auth-loading' // @server:auth
import { MainError } from '@/layout/main-layout/main-error'
import { MainLayout } from '@/layout/main-layout/main-layout'
import { MainLoading } from '@/layout/main-layout/main-loading'
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
          element: <MainLayout nav={NAV} />,
          children: [
            {
              // React Router shows the nearest HydrateFallback at or above the first route whose
              // loader is still pending, so this one covers every page below it.
              HydrateFallback: MainLoading,
              ErrorBoundary: MainError,
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
          Component: AuthLayout,
          children: [
            {
              HydrateFallback: AuthLoading,
              ErrorBoundary: AuthError,
              children: authRoutes(store),
            },
          ],
        },
        // @server:auth-end
      ],
    },
  ]
}
