import type { NavEntry } from '@/shared/ui/pattern/nav-entry'

// The one table of top-level routes: a feature adds its entry here. The template renders no
// navigation; the product's shell reads this table, and `screens.spec.ts` captures every entry.
export const NAV: NavEntry[] = [{ href: '/', label: 'Home' }]
