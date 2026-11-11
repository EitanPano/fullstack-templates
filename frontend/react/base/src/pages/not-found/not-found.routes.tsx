import type { RouteObject } from 'react-router'

// The catch-all, last in the main group so an unknown URL renders inside main.
export function notFoundRoutes(): RouteObject[] {
  return [{ path: '*', lazy: () => import('./not-found-page') }]
}
