import { Link, NavLink, Outlet } from 'react-router'

import type { NavEntry } from '@/models/nav'

// The shell every page sits in: skip link, header with the primary navigation, the main landmark
// and the footer. The nav table is a prop because layout/ never imports app/.
export function MainLayout({ nav }: { nav: NavEntry[] }) {
  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="header">
        <Link to="/" className="header__brand">
          __PROJECT_DISPLAY_NAME__
        </Link>
        <nav aria-label="Primary" className="header__nav">
          {nav.map((entry) => (
            <NavLink key={entry.to} to={entry.to} end className="header__link">
              {entry.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="main">
        <Outlet />
      </main>
      <footer className="footer">__PROJECT_DISPLAY_NAME__</footer>
    </div>
  )
}
