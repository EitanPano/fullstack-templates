import { XIcon } from 'lucide-react'
import { Dialog as SheetPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'

import { Button } from '@/shared/components/button'
import { cn } from '@/shared/utils/cn'
import './sheet.scss'

export const Sheet = SheetPrimitive.Root
export const SheetTrigger = SheetPrimitive.Trigger

// A side panel from the inline start: Radix Dialog with the overlay and a Close button inside, first so the tab order
// matches the visual order.
// Give it a SheetTitle (it names the dialog) and a SheetDescription (visually hidden if unwanted).
export function SheetContent({
  className,
  children,
  ...props
}: ComponentProps<typeof SheetPrimitive.Content>) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="sheet__overlay" />
      <SheetPrimitive.Content className={cn('sheet', className)} {...props}>
        <SheetPrimitive.Close asChild>
          <Button variant="ghost" size="icon" aria-label="Close" className="sheet__close">
            <XIcon aria-hidden="true" className="icon" />
          </Button>
        </SheetPrimitive.Close>
        {children}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  )
}

export function SheetHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('sheet__header', className)} {...props} />
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title className={cn('sheet__title', className)} {...props} />
}

export function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description className={cn('sheet__description', className)} {...props} />
}
