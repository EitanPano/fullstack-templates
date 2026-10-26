'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/shared/lib/cn'

export type NavEntry = { href: string; label: string }

// A client leaf only because the current path is a browser-router fact.
function useIsCurrent() {
  const pathname = usePathname()
  return (href: string) => pathname === href || (href !== '/' && pathname.startsWith(`${href}/`))
}

const linkClass =
  'inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:h-11 aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground'

// The inline navigation from `md` up. The phone gets the same entries in `MobileNav`.
export function NavLinks({ nav }: { nav: NavEntry[] }) {
  const isCurrent = useIsCurrent()
  return (
    <ul className="flex items-center gap-1">
      {nav.map((entry) => (
        <li key={entry.href}>
          <Link
            href={entry.href}
            aria-current={isCurrent(entry.href) ? 'page' : undefined}
            className={linkClass}
          >
            {entry.label}
          </Link>
        </li>
      ))}
    </ul>
  )
}

// The links inside the phone sheet; `onNavigate` closes it.
export function SheetNavLinks({ nav, onNavigate }: { nav: NavEntry[]; onNavigate: () => void }) {
  const isCurrent = useIsCurrent()
  return (
    <ul className="flex flex-col gap-1">
      {nav.map((entry) => (
        <li key={entry.href}>
          <Link
            href={entry.href}
            onClick={onNavigate}
            aria-current={isCurrent(entry.href) ? 'page' : undefined}
            className={cn(linkClass, 'h-11 w-full text-base')}
          >
            {entry.label}
          </Link>
        </li>
      ))}
    </ul>
  )
}
