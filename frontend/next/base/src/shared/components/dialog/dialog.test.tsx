import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/dialog/dialog'

function Example() {
  return (
    <Dialog>
      <DialogTrigger>Open dialog</DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Rename</DialogTitle>
          <DialogDescription>Pick a new name</DialogDescription>
        </DialogHeader>
        <DialogFooter>Footer</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

describe('Dialog', () => {
  it('opens as a dialog named by its h2 title, with a Close button', async () => {
    render(<Example />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Open dialog' }))

    const dialog = await screen.findByRole('dialog', { name: 'Rename' })
    expect(dialog).toHaveClass('dialog', 'dialog--sm')
    expect(screen.getByRole('heading', { level: 2, name: 'Rename' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('button', 'dialog__close')
  })

  it('closes with the Close button', async () => {
    render(<Example />)
    await userEvent.click(screen.getByRole('button', { name: 'Open dialog' }))

    await userEvent.click(await screen.findByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    render(<Example />)
    await userEvent.click(screen.getByRole('button', { name: 'Open dialog' }))
    await screen.findByRole('dialog')

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
