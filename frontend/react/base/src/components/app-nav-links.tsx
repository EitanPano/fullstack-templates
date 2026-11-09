import { NavLink } from 'react-router'

import type { NavEntry } from '@/models/nav'

// The inline navigation from md. NavLink sets aria-current="page" on the entry for the current
// route, which is also the styling hook. The phone gets the same entries in the sheet.
export function AppNavLinks({ nav }: { nav: NavEntry[] }) {
  return (
    <ul className="nav-links">
      {nav.map((entry) => (
        <li key={entry.to}>
          <NavLink to={entry.to} end={entry.to === '/'} className="nav-links__link">
            {entry.label}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

// The links inside the phone sheet; `onNavigate` closes it.
export function SheetNavLinks({ nav, onNavigate }: { nav: NavEntry[]; onNavigate: () => void }) {
  return (
    <ul className="nav-links nav-links--stacked">
      {nav.map((entry) => (
        <li key={entry.to}>
          <NavLink
            to={entry.to}
            end={entry.to === '/'}
            onClick={onNavigate}
            className="nav-links__link"
          >
            {entry.label}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}
