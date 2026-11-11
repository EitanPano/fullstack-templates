import type { NavEntry } from '@/models/nav/interface'

// The one table of top-level routes: a page adds its entry here. `screens.spec` captures every
// entry, and the navigation a product builds reads it.
export const NAV: NavEntry[] = [{ to: '/', label: 'Home' }]
