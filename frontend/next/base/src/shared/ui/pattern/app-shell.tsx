import Link from 'next/link'
import { Suspense, type ReactNode } from 'react'

import { MobileNav } from './mobile-nav'
import { NavLinks, type NavEntry } from './nav-links'

// The page frame: skip link, banner, primary navigation (inline from `md`, a sheet on phones),
// an account slot, the page's one `main`, footer. A route group's layout composes it; a
// feature renders inside `main` and never adds a landmark set.
export function AppShell({
  name,
  nav,
  account,
  children,
}: {
  name: string
  nav: NavEntry[]
  account?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:inline-flex focus:h-11 focus:items-center focus:rounded-md focus:bg-primary focus:px-4 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <header className="border-b border-border bg-background px-4 sm:px-8">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2">
          <MobileNav nav={nav} />
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-md px-2 font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:h-11"
          >
            {name}
          </Link>
          <nav aria-label="Primary" className="ml-4 hidden md:block">
            {/* usePathname is a request-time value under Cache Components. */}
            <Suspense fallback={null}>
              <NavLinks nav={nav} />
            </Suspense>
          </nav>
          <div className="ml-auto flex items-center gap-2">{account}</div>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 focus:outline-none sm:px-8"
      >
        {children}
      </main>
      <footer className="border-t border-border px-4 py-4 text-sm text-muted-foreground sm:px-8">
        <div className="mx-auto w-full max-w-5xl">{name}</div>
      </footer>
    </div>
  )
}
