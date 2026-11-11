import type { ReactNode } from 'react'

import { SkipLink } from '@/shared/ui/pattern/skip-link'

// The site frame: the skip link, then the page's one `main`. `main` has no width and no padding;
// `Page` owns the container, so a full-bleed screen simply skips it. A product's header,
// navigation and footer go between the two (AGENTS.md › The shell).
export default function SiteLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col focus:outline-none">
        {children}
      </main>
    </div>
  )
}
