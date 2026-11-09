import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { MobileNav } from '@/layout/components/mobile-nav'
import { NavLinks } from '@/layout/components/nav-links'
import type { NavEntry } from '@/models/nav'

// The banner: the phone menu, the brand, the inline navigation (from md) and an account slot at
// the inline end. The slot is a prop so the layout decides what sits there.
export function Header({ nav, account }: { nav: NavEntry[]; account?: ReactNode }) {
  return (
    <header className="header">
      <div className="header__inner container">
        <MobileNav nav={nav} />
        <Link to="/" className="header__brand">
          __PROJECT_DISPLAY_NAME__
        </Link>
        <nav aria-label="Primary" className="header__nav">
          <NavLinks nav={nav} />
        </nav>
        <div className="header__account">{account}</div>
      </div>
    </header>
  )
}
