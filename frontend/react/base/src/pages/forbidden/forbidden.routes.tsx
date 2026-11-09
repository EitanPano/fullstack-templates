import type { RouteObject } from 'react-router'

// Where `requireRole` sends a signed-in account whose role is not enough. No loader: the page
// says nothing about what the page it came from would have held.
export function forbiddenRoutes(): RouteObject[] {
  return [{ path: 'forbidden', lazy: () => import('./pages/forbidden-page') }]
}
