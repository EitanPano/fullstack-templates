import type { RouteObject } from 'react-router'

// The index route. No loader and no data call: it is the product's first screen to replace.
export function homeRoutes(): RouteObject[] {
  return [{ index: true, lazy: () => import('./home-page/home-page') }]
}
