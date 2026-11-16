// screen-routes.ts belongs: the screens the suite captures and checks: every route of the one nav
// table (a route added to src/nav.ts is covered with no edit here), the 404 page, and the
// product's own extras. It does not belong: the checks themselves (screens.spec.ts).
import { NAV } from '../../src/nav'

// An address no page owns: Pages answers it with 404.html and status 404.
export const NOT_FOUND = '/no/such/page'

// Routes that are in no nav (a page a product reaches by a link only): add them here.
export const EXTRA_ROUTES: readonly string[] = []

export function capturedRoutes(
  nav: readonly string[] = NAV.map((entry) => entry.path),
  extra: readonly string[] = EXTRA_ROUTES,
): string[] {
  return [...new Set([...nav, ...extra, NOT_FOUND])]
}
