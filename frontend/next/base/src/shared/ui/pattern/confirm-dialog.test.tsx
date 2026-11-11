import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/pattern/confirm-dialog'

function renderDialog(onConfirm = vi.fn()) {
  render(
    <ConfirmDialog
      trigger={<Button>Delete</Button>}
      title="Delete this item?"
      description="This cannot be undone."
      confirmLabel="Delete item"
      onConfirm={onConfirm}
    />,
  )
  return onConfirm
}

describe('ConfirmDialog', () => {
  it('stays closed until the trigger is pressed', () => {
    renderDialog()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('names the choice and runs onConfirm once, then closes', async () => {
    const onConfirm = renderDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete this item?' })
    expect(dialog).toHaveTextContent('This cannot be undone.')
    await userEvent.click(screen.getByRole('button', { name: 'Delete item' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('cancels without running onConfirm', async () => {
    const onConfirm = renderDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the dialog open when onConfirm fails', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('refused'))
    renderDialog(onConfirm)

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Delete item' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
