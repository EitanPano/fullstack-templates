import { Outlet } from 'react-router'

import { Footer } from '@/layout/components/footer'
import { Header } from '@/layout/components/header'
import { UserMenu } from '@/layout/components/user-menu'
import type { NavEntry } from '@/models/nav'

// The shell every page sits in: skip link, header with the primary navigation and the account
// menu, the main landmark and the footer. The nav table is a prop because layout/ never imports
// app/.
export function MainLayout({ nav }: { nav: NavEntry[] }) {
  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Header nav={nav} account={<UserMenu />} />
      <main id="main" tabIndex={-1} className="main">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
