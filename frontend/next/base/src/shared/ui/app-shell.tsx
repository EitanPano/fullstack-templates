import Link from 'next/link'
import type { ReactNode } from 'react'

import { NavLinks, type NavLinkEntry } from '@/shared/ui/nav-links'

// The page frame: skip link, banner, primary navigation, the page's one `main`, footer.
// The root layout composes it; a feature renders inside `main` and never adds a landmark set.
export function AppShell({
  name,
  nav,
  children,
}: {
  name: string
  nav: NavLinkEntry[]
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-10 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-md focus:bg-primary focus:px-4 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <header className="border-b border-border bg-muted px-4 sm:px-8">
        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-x-4">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-md px-3 font-semibold hover:bg-muted hover:underline"
          >
            {name}
          </Link>
          <nav aria-label="Primary">
            <NavLinks nav={nav} />
          </nav>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 focus:outline-none sm:px-8"
      >
        {children}
      </main>
      <footer className="border-t border-border bg-muted px-4 py-4 text-sm text-muted-foreground sm:px-8">
        <div className="mx-auto w-full max-w-2xl">{name}</div>
      </footer>
    </div>
  )
}
