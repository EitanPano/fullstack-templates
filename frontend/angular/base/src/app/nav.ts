import type { NavEntry } from '@app/models/nav/interface'

export type { NavEntry }

// The one navigation table; app.config.ts hands it to the main layout through the NAV_ENTRIES token.
export const NAV: readonly NavEntry[] = [{ path: '/', labelKey: 'nav.home' }]
