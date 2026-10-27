import { NavLink } from 'react-router'

import { cn } from '@/shared/lib/cn'

export type NavEntry = { to: string; label: string }

const linkClass =
  'inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:h-11 aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground'

// The inline navigation from `md` up. The phone gets the same entries in `MobileNav`. NavLink
// sets `aria-current="page"` on the entry for the current route, which the classes style.
export function NavLinks({ nav }: { nav: NavEntry[] }) {
  return (
    <ul className="flex items-center gap-1">
      {nav.map((entry) => (
        <li key={entry.to}>
          <NavLink to={entry.to} end={entry.to === '/'} className={linkClass}>
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
    <ul className="flex flex-col gap-1">
      {nav.map((entry) => (
        <li key={entry.to}>
          <NavLink
            to={entry.to}
            end={entry.to === '/'}
            onClick={onNavigate}
            className={cn(linkClass, 'h-11 w-full text-base')}
          >
            {entry.label}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}
