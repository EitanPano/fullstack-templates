import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderWithApp } from '@/testing/render'

import ConfirmDialog from './confirm-dialog.vue'

const PROPS = { open: true, title: 'Delete post?', message: 'It cannot be undone.' }

describe('ConfirmDialog', () => {
  it('asks the question in a dialog with Cancel and Confirm', async () => {
    await renderWithApp(ConfirmDialog, { props: PROPS })

    expect(await screen.findByRole('dialog', { name: 'Delete post?' })).toBeInTheDocument()
    expect(screen.getByText('It cannot be undone.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
  })

  it('confirms: emits confirm, then asks to close', async () => {
    const view = await renderWithApp(ConfirmDialog, { props: PROPS })

    await userEvent.click(await screen.findByRole('button', { name: 'Confirm' }))

    expect(view.emitted('confirm')).toHaveLength(1)
    expect(view.emitted('cancel')).toBeUndefined()
    expect(view.emitted('update:open')).toEqual([[false]])
  })

  it('cancels: emits cancel, then asks to close', async () => {
    const view = await renderWithApp(ConfirmDialog, { props: PROPS })

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(view.emitted('cancel')).toHaveLength(1)
    expect(view.emitted('confirm')).toBeUndefined()
    expect(view.emitted('update:open')).toEqual([[false]])
  })

  it('counts Escape as a cancel', async () => {
    const view = await renderWithApp(ConfirmDialog, { props: PROPS })
    await screen.findByRole('dialog')

    await userEvent.keyboard('{Escape}')

    expect(view.emitted('cancel')).toHaveLength(1)
    expect(view.emitted('confirm')).toBeUndefined()
  })

  it('words the confirm button, and turns it red for a destructive action', async () => {
    await renderWithApp(ConfirmDialog, {
      props: { ...PROPS, confirmLabel: 'Delete', danger: true },
    })

    expect(await screen.findByRole('button', { name: 'Delete' })).toHaveClass('button--danger')
  })
})
