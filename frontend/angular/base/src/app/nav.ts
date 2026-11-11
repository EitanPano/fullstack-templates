import type { NavEntry } from '@app/models/nav/interface'

export type { NavEntry }

// The one navigation table; app.config.ts provides it through the NAV_ENTRIES token
// for the navigation a product builds; no template file reads it, but screens.spec does.
export const NAV: readonly NavEntry[] = [{ path: '/', labelKey: 'nav.home' }]
