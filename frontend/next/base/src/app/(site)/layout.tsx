import type { ReactNode } from 'react'

// The site frame: the skip link, then the page's one `main`. `main` has no width and no padding;
// `Page` owns the container, so a full-bleed screen simply skips it. A product's header,
// navigation and footer go between the two (AGENTS.md › The shell).
export default function SiteLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <main id="main" tabIndex={-1} className="main">
        {children}
      </main>
    </div>
  )
}
