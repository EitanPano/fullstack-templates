import type { RouteObject } from 'react-router'

import { loadHealth } from '@/feature/health/api/health'

import RootError from './error'
import HomeError from './home/error'
import HomeLoading from './home/loading'
import HomePage from './home/page'
import RootLayout from './layout'
import NotFound from './not-found'

// The route table: paths to components and loaders, nothing else. Each segment names its
// page, its HydrateFallback (loading) and its ErrorBoundary (error).
export const routes: RouteObject[] = [
  {
    path: '/',
    Component: RootLayout,
    ErrorBoundary: RootError,
    children: [
      {
        index: true,
        loader: loadHealth,
        Component: HomePage,
        HydrateFallback: HomeLoading,
        ErrorBoundary: HomeError,
      },
      { path: '*', Component: NotFound },
    ],
  },
]
