import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/shared/ui/sheet'

// Jsdom has no pointer media, so the 44 px touch target is asserted on the classes.
describe('overlay close buttons', () => {
  it('the dialog close button is a 44 px target under pointer-coarse', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>T</DialogTitle>
          <DialogDescription>D</DialogDescription>
        </DialogContent>
      </Dialog>,
    )

    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('pointer-coarse:size-11')
  })

  it('the sheet close button is a 44 px target under pointer-coarse', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>T</SheetTitle>
          <SheetDescription>D</SheetDescription>
        </SheetContent>
      </Sheet>,
    )

    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('pointer-coarse:size-11')
  })
})
