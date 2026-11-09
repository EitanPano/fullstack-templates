import { Outlet } from 'react-router'

import { AppFooter } from '@/components/app-footer'
import { AppAccountSlot } from '@/components/app-account-slot'
import { AppHeader } from '@/components/app-header'
import type { NavEntry } from '@/models/nav'

// The shell every page sits in: skip link, header with the primary navigation and the account
// menu, the main landmark and the footer. The nav table is a prop because components/ never imports
// app/.
export function AppMainLayout({ nav }: { nav: NavEntry[] }) {
  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <AppHeader nav={nav} account={<AppAccountSlot />} />
      <main id="main" tabIndex={-1} className="main">
        <Outlet />
      </main>
      <AppFooter />
    </div>
  )
}
