import { WifiOffIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { AppMobileNav } from '@/components/app-mobile-nav'
import { AppNavLinks } from '@/components/app-nav-links'
import type { NavEntry } from '@/models/nav'
import { Badge } from '@/shared/components/badge'
import { useOnlineStatus } from '@/shared/hooks/use-online-status'
import './app-header.scss'

// The banner: the phone menu, the brand, the inline navigation (from md) and an account slot at
// the inline end. The slot is a prop so the layout decides what sits there.
export function AppHeader({ nav, account }: { nav: NavEntry[]; account?: ReactNode }) {
  const online = useOnlineStatus()

  return (
    <header className="header">
      <div className="header__inner container">
        <AppMobileNav nav={nav} />
        <Link to="/" className="header__brand">
          __PROJECT_DISPLAY_NAME__
        </Link>
        <nav aria-label="Primary" className="header__nav">
          <AppNavLinks nav={nav} />
        </nav>
        <div className="header__account">
          <span className="header__status" aria-live="polite">
            {online ? null : (
              <Badge variant="warning" role="status">
                <WifiOffIcon aria-hidden="true" className="icon" />
                Offline
              </Badge>
            )}
          </span>
          {account}
        </div>
      </div>
    </header>
  )
}
