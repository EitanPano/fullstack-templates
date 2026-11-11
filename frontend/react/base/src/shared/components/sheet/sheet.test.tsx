import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/shared/components/sheet/sheet'

function Example() {
  return (
    <Sheet>
      <SheetTrigger>Open sheet</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
          <SheetDescription>Pick a page</SheetDescription>
        </SheetHeader>
        <p>Body</p>
      </SheetContent>
    </Sheet>
  )
}

describe('Sheet', () => {
  it('opens on click as a dialog named by its title, with a Close button', async () => {
    render(<Example />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Open sheet' }))

    expect(await screen.findByRole('dialog', { name: 'Menu' })).toHaveClass('sheet')
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('closes with the Close button', async () => {
    render(<Example />)
    await userEvent.click(screen.getByRole('button', { name: 'Open sheet' }))

    await userEvent.click(await screen.findByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    render(<Example />)
    await userEvent.click(screen.getByRole('button', { name: 'Open sheet' }))
    await screen.findByRole('dialog')

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
