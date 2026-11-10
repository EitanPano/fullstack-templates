import type { NavEntry } from '@/models/nav/interface'

// The one nav table: the e2e screen list reads it, and so does the navigation a product builds. A
// feature adds an entry here and a route in app/routes.ts.
export const NAV: readonly NavEntry[] = [{ path: '/', labelKey: 'nav.home' }]
