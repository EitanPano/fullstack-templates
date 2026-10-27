import type { QueryClient } from '@tanstack/react-query'
import { Outlet, type RouteObject } from 'react-router'

import { healthQuery } from '@/entity/health/api/health'
import { redirectIfSignedIn, requireAccount, returnToOf } from '@/shared/auth/session' // @server:auth

import AuthError from './(auth)/error' // @server:auth
import AuthLayout from './(auth)/layout' // @server:auth
import AuthLoading from './(auth)/loading' // @server:auth
import SignInPage from './(auth)/sign-in/page' // @server:auth
import SignUpPage from './(auth)/sign-up/page' // @server:auth
import SiteError from './(site)/error'
import ForbiddenPage from './(site)/forbidden/page' // @server:auth
import SiteLayout from './(site)/layout'
import SiteLoading from './(site)/loading'
import SiteNotFound from './(site)/not-found'
import HomePage from './(site)/page'
import ProfilePage from './(site)/profile/page' // @server:auth
import RootError from './root-error'

// The route table: paths to components and loaders, nothing else. A route group is a pathless
// route with its own HydrateFallback (loading) and ErrorBoundary (error), nested inside the
// group's layout so a failure renders inside the shell. A loader calls `queryClient.query` for
// what the page's widgets read (it returns cached data younger than the stale time, else fetches);
// the widgets then suspend on the same query. The query client is passed in so a test can render
// the table against its own.
export function createRoutes(queryClient: QueryClient): RouteObject[] {
  return [
    {
      path: '/',
      Component: Outlet,
      ErrorBoundary: RootError,
      children: [
        {
          Component: SiteLayout,
          children: [
            {
              // React Router shows the nearest HydrateFallback at or above the first route whose
              // loader is still pending, so this one covers every page below it.
              HydrateFallback: SiteLoading,
              ErrorBoundary: SiteError,
              children: [
                {
                  index: true,
                  loader: () => queryClient.query(healthQuery()),
                  Component: HomePage,
                },
                // @server:auth-start
                {
                  path: 'profile',
                  loader: ({ request }) => requireAccount(queryClient, returnToOf(request)),
                  Component: ProfilePage,
                },
                { path: 'forbidden', Component: ForbiddenPage },
                // @server:auth-end
                { path: '*', Component: SiteNotFound },
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
              children: [
                {
                  path: 'sign-in',
                  loader: () => redirectIfSignedIn(queryClient),
                  Component: SignInPage,
                },
                {
                  path: 'sign-up',
                  loader: () => redirectIfSignedIn(queryClient),
                  Component: SignUpPage,
                },
              ],
            },
          ],
        },
        // @server:auth-end
      ],
    },
  ]
}
