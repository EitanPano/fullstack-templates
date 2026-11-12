import { useState, type ReactNode } from 'react'

import { Button } from '@/shared/components/button/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/dialog/dialog'

// Asks before a destructive or irreversible action. `onConfirm` may be async: the dialog stays
// open while it runs and when it throws (the caller reports the failure), and closes when it
// resolves. Cancel comes first in the tab order, so it takes the initial focus.
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
}: {
  trigger: ReactNode
  title: string
  description: string
  // The verb and its object ("Delete plant"), never a bare "Confirm".
  confirmLabel: string
  destructive?: boolean
  onConfirm: () => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  async function confirm() {
    setPending(true)
    try {
      await onConfirm()
      setOpen(false)
    } catch {
      // The caller owns the error message; the dialog just stays open for a retry.
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={() => void confirm()}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
