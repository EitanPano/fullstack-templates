import { XIcon } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'

import { Button } from '@/shared/components/button'
import { cn } from '@/shared/utils/cn'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

// A centred modal: Radix Dialog with the overlay and a Close button inside. Give it a
// DialogTitle (it names the dialog) and a DialogDescription.
export function DialogContent({
  className,
  children,
  size = 'md',
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="dialog__overlay" />
      <DialogPrimitive.Content className={cn('dialog', `dialog--${size}`, className)} {...props}>
        {children}
        <DialogPrimitive.Close asChild>
          <Button variant="ghost" size="icon" aria-label="Close" className="dialog__close">
            <XIcon aria-hidden="true" className="icon" />
          </Button>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('dialog__header', className)} {...props} />
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('dialog__footer', className)} {...props} />
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('dialog__title', className)} {...props} />
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('dialog__description', className)} {...props} />
}
