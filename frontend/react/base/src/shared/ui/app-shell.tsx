import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router'

type ShellNavEntry = { to: string; label: string }

const link = 'inline-flex min-h-11 items-center px-3 rounded-md hover:bg-muted hover:underline'

// The page frame: skip link, header with the primary nav, the page's one `main`, footer.
// A feature renders inside `main` and never adds a second landmark set.
export function AppShell({
  name,
  nav,
  children,
}: {
  name: string
  nav: ShellNavEntry[]
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
          <Link to="/" className={`${link} font-semibold`}>
            {name}
          </Link>
          <nav aria-label="Primary">
            <ul className="flex flex-wrap items-center gap-1">
              {nav.map((entry) => (
                <li key={entry.to}>
                  <NavLink
                    to={entry.to}
                    end={entry.to === '/'}
                    className={({ isActive }) =>
                      `${link} ${isActive ? 'bg-background font-semibold underline' : ''}`
                    }
                  >
                    {entry.label}
                  </NavLink>
                </li>
              ))}
            </ul>
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
