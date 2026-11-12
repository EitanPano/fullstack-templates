import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderWithApp } from '@/testing/render'

import FormActions from './form-actions.vue'

describe('FormActions', () => {
  it('has a submit button labelled Submit', async () => {
    await renderWithApp(FormActions)

    expect(screen.getByRole('button', { name: 'Submit' })).toHaveAttribute('type', 'submit')
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })

  it('takes other label keys', async () => {
    await renderWithApp(FormActions, { props: { submitKey: 'modal.confirm' } })

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
  })

  it('is busy and inert while pending', async () => {
    await renderWithApp(FormActions, { props: { pending: true, cancellable: true } })

    expect(screen.getByRole('button', { name: 'Submit' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('disables the submit when disabled', async () => {
    await renderWithApp(FormActions, { props: { disabled: true } })

    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
  })

  it('asks to cancel from the secondary button', async () => {
    const view = await renderWithApp(FormActions, { props: { cancellable: true } })

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(view.emitted('cancelled')).toHaveLength(1)
  })
})
