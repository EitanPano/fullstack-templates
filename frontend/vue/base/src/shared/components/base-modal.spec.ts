import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderWithApp } from '@/testing/render'

import BaseModal from './base-modal.vue'

describe('AppModal', () => {
  it('renders nothing while closed', async () => {
    await renderWithApp(BaseModal, { props: { open: false, title: 'Edit post' } })

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is a modal dialog named by its title, with the slot as its body', async () => {
    await renderWithApp(BaseModal, {
      props: { open: true, title: 'Edit post' },
      slots: { default: '<p>Body text</p>' },
    })

    const dialog = await screen.findByRole('dialog', { name: 'Edit post' })
    expect(dialog).toHaveAttribute('data-state', 'open')
    expect(dialog).toHaveClass('modal', 'modal--md')
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Edit post' })).toHaveClass(
      'modal__title',
    )
    expect(within(dialog).getByText('Body text')).toBeInTheDocument()
  })

  it('takes a size', async () => {
    await renderWithApp(BaseModal, { props: { open: true, title: 'T', size: 'lg' } })

    expect(await screen.findByRole('dialog')).toHaveClass('modal--lg')
  })

  it('asks to close from its close button', async () => {
    const view = await renderWithApp(BaseModal, { props: { open: true, title: 'T' } })

    await userEvent.click(await screen.findByRole('button', { name: 'Close' }))

    expect(view.emitted('update:open')).toEqual([[false]])
  })

  it('asks to close on Escape', async () => {
    const view = await renderWithApp(BaseModal, { props: { open: true, title: 'T' } })
    await screen.findByRole('dialog')

    await userEvent.keyboard('{Escape}')

    expect(view.emitted('update:open')).toEqual([[false]])
  })

  it('keeps Tab inside the dialog', async () => {
    await renderWithApp(BaseModal, {
      props: { open: true, title: 'T' },
      slots: { default: '<button>Inside</button>' },
    })
    const dialog = await screen.findByRole('dialog')

    await userEvent.tab()
    await userEvent.tab()
    await userEvent.tab()

    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })
})
