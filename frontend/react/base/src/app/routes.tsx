import { Outlet, type RouteObject } from 'react-router'

import RootError from '@/app/root-error/root-error'
import { authRoutes } from '@/pages/auth/auth.routes' // @server:auth
import { forbiddenRoutes } from '@/pages/forbidden/forbidden.routes' // @server:auth
import { homeRoutes } from '@/pages/home/home.routes'
import { notFoundRoutes } from '@/pages/not-found/not-found.routes'
import { userRoutes } from '@/pages/user/user.routes' // @server:auth
import { AppAuthError } from '@/layout/app-auth-error' // @server:auth
import { AppAuthLayout } from '@/layout/app-auth-layout/app-auth-layout' // @server:auth
import { AppAuthLoading } from '@/layout/app-auth-loading' // @server:auth
import { AppMainError } from '@/layout/app-main-error'
import { AppMainLayout } from '@/layout/app-main-layout/app-main-layout'
import { AppMainLoading } from '@/layout/app-main-loading/app-main-loading'
import type { AppStore } from '@/store'

// The route table: paths to components and loaders, nothing else. A route group is a pathless
// route with its own HydrateFallback (loading) and ErrorBoundary (error), nested inside the
// group's layout so a failure renders inside the layout's main. It is a function of the store so a test
// renders the table against its own; only the guarded and auth routes read it, so without auth the
// parameter is unused.
export function createRoutes(store: AppStore): RouteObject[] { // @server:auth
export function createRoutes(_store: AppStore): RouteObject[] { // @noserver:auth
  return [
    {
      path: '/',
      Component: Outlet,
      ErrorBoundary: RootError,
      children: [
        {
          element: <AppMainLayout />,
          children: [
            {
              // React Router shows the nearest HydrateFallback at or above the first route whose
              // loader is still pending, so this one covers every page below it.
              HydrateFallback: AppMainLoading,
              ErrorBoundary: AppMainError,
              children: [
                ...homeRoutes(),
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
