import { MenuIcon } from 'lucide-react'
import { useState } from 'react'

import { SheetNavLinks } from '@/components/app-nav-links'
import type { NavEntry } from '@/models/nav'
import { Button } from '@/shared/components/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/shared/components/sheet'
import { useMediaQuery } from '@/shared/hooks/use-media-query'
import './app-mobile-nav.scss'

// The md breakpoint, as src/styles/setup/_breakpoints.scss defines it (768px): keep the two equal.
const MD_QUERY = '(min-width: 768px)'

// The phone navigation: the same entries as the inline nav, in a sheet. The trigger is hidden
// from md by CSS; the sheet nav carries the landmark name and closes when a link is followed.
export function AppMobileNav({ nav }: { nav: NavEntry[] }) {
  const [open, setOpen] = useState(false)
  const atMd = useMediaQuery(MD_QUERY)

  // The trigger is hidden from md, so a sheet left open would stay as a modal with no way to
  // close it. Adjusting state during render (not in an effect) avoids a frame of the open modal.
  if (atMd && open) setOpen(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="mobile-nav__trigger" aria-label="Open menu">
          <MenuIcon aria-hidden="true" className="icon" />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
          <SheetDescription className="visually-hidden">Navigate to a page</SheetDescription>
        </SheetHeader>
        <nav aria-label="Primary">
          <SheetNavLinks
            nav={nav}
            onNavigate={() => {
              setOpen(false)
            }}
          />
        </nav>
      </SheetContent>
    </Sheet>
  )
}
