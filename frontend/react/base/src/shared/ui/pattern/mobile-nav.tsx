import { MenuIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/shared/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/shared/ui/sheet'

import { SheetNavLinks, type NavEntry } from './nav-links'

// The phone navigation: the same entries as the inline nav, in a sheet. Hidden from `md` up,
// where the inline nav shows. The sheet's `nav` carries the landmark name.
export function MobileNav({ nav }: { nav: NavEntry[] }) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <MenuIcon aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-4">
        <SheetHeader className="p-0">
          <SheetTitle>Menu</SheetTitle>
          <SheetDescription className="sr-only">Navigate to a page</SheetDescription>
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
