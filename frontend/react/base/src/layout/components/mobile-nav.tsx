import { MenuIcon } from 'lucide-react'
import { useState } from 'react'

import { SheetNavLinks } from '@/layout/components/nav-links'
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

// The phone navigation: the same entries as the inline nav, in a sheet. The trigger is hidden
// from md by CSS; the sheet nav carries the landmark name and closes when a link is followed.
export function MobileNav({ nav }: { nav: NavEntry[] }) {
  const [open, setOpen] = useState(false)

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
