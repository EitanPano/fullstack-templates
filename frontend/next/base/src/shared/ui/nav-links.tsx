'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type NavLinkEntry = { href: string; label: string }

// A client leaf only because the current path is a browser-router fact.
export function NavLinks({ nav }: { nav: NavLinkEntry[] }) {
  const pathname = usePathname()

  return (
    <ul className="flex flex-wrap items-center gap-1">
      {nav.map((entry) => {
        const current =
          pathname === entry.href || (entry.href !== '/' && pathname.startsWith(`${entry.href}/`))
        return (
          <li key={entry.href}>
            <Link
              href={entry.href}
              aria-current={current ? 'page' : undefined}
              className={`inline-flex min-h-11 items-center rounded-md px-3 hover:bg-muted hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ${current ? 'bg-background font-semibold underline' : ''}`}
            >
              {entry.label}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
