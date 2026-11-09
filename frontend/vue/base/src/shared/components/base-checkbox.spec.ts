import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderWithApp } from '@/testing/render'

import BaseCheckbox from './base-checkbox.vue'

describe('AppCheckbox', () => {
  it('is a checkbox named by its slot, reflecting the model', async () => {
    await renderWithApp(BaseCheckbox, {
      props: { modelValue: true },
      slots: { default: 'Remember me' },
    })

    const box = screen.getByRole('checkbox', { name: 'Remember me' })
    expect(box).toBeChecked()
    expect(box).toHaveAttribute('data-state', 'checked')
  })

  it('toggles on a click of the box and again on a click of the label', async () => {
    const view = await renderWithApp(BaseCheckbox, {
      props: { modelValue: false },
      slots: { default: 'Remember me' },
    })

    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByText('Remember me'))

    expect(view.emitted('update:modelValue')).toEqual([[true], [false]])
  })

  it('toggles from the keyboard', async () => {
    const view = await renderWithApp(BaseCheckbox, {
      props: { modelValue: false },
      slots: { default: 'Remember me' },
    })

    await userEvent.tab()
    await userEvent.keyboard(' ')

    expect(view.emitted('update:modelValue')).toEqual([[true]])
  })

  it('does not toggle when disabled', async () => {
    const view = await renderWithApp(BaseCheckbox, {
      props: { modelValue: false, disabled: true },
      slots: { default: 'Remember me' },
    })

    await userEvent.click(screen.getByRole('checkbox'))

    expect(view.emitted('update:modelValue')).toBeUndefined()
  })

  it('emits blur', async () => {
    const view = await renderWithApp(BaseCheckbox, { slots: { default: 'Remember me' } })

    await userEvent.tab()
    await userEvent.tab()

    expect(view.emitted('blur')).toHaveLength(1)
  })
})
