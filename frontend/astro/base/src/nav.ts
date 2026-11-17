// nav.ts belongs: the one table of top-level routes. The e2e screen list reads it, and so does the
// navigation a product builds. A page adds an entry here and a file in src/pages/.
// It does not belong: the navigation component (product code) or a route that is not a page.
import type { NavEntry } from './models/nav/type'

export const NAV: readonly NavEntry[] = [{ path: '/', label: 'Home' }]
