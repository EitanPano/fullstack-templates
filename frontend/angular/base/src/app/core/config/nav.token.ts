import { InjectionToken } from '@angular/core'

import type { NavEntry } from '@app/models/nav/interface'

// The navigation table (app/nav.ts), provided in app.config.ts for the product's own navigation
// component, which reads it through this token because components/ may not import app/.
export const NAV_ENTRIES = new InjectionToken<readonly NavEntry[]>('NAV_ENTRIES')
