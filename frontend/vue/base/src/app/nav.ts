import type { NavEntry } from '@/models/nav/interface'

// The one nav table: the side nav, the header's home link and the e2e screen list read it. A
// feature adds an entry here and a route in app/routes.ts.
export const NAV: readonly NavEntry[] = [{ path: '/', labelKey: 'nav.home' }]
