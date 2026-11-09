import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderWithApp } from '@/testing/render'

import BaseInput from './base-input.vue'

describe('AppInput', () => {
  it('shows the value and emits what the user types', async () => {
    const view = await renderWithApp(BaseInput, { props: { modelValue: 'ab' } })
    const input = screen.getByRole('textbox')
    expect(input).toHaveValue('ab')

    await userEvent.type(input, 'c')

    expect(view.emitted('update:modelValue').at(-1)).toEqual(['abc'])
  })

  it('shows an empty field for null', async () => {
    await renderWithApp(BaseInput, { props: { modelValue: null } })

    expect(screen.getByRole('textbox')).toHaveValue('')
  })

  it('holds a number for a number field, and null when it is emptied', async () => {
    const view = await renderWithApp(BaseInput, { props: { type: 'number', modelValue: null } })
    const input = screen.getByRole('spinbutton')

    await userEvent.type(input, '12')
    expect(view.emitted('update:modelValue').at(-1)).toEqual([12])

    await userEvent.clear(input)
    expect(view.emitted('update:modelValue').at(-1)).toEqual([null])
  })

  it('emits blur so a form can mark the field touched', async () => {
    const view = await renderWithApp(BaseInput)

    await userEvent.click(screen.getByRole('textbox'))
    await userEvent.tab()

    expect(view.emitted('blur')).toHaveLength(1)
  })

  it('passes other attributes to the input, not to its wrapper', async () => {
    const { container } = await renderWithApp(BaseInput, {
      props: { name: 'email', autocomplete: 'email', placeholder: 'you@x.co', 'data-testid': 'e' },
    })

    const input = screen.getByTestId('e')
    expect(input.tagName).toBe('INPUT')
    expect(input).toHaveAttribute('name', 'email')
    expect(input).toHaveAttribute('autocomplete', 'email')
    expect(input).toHaveAttribute('placeholder', 'you@x.co')
    expect(container.querySelector('.control')).not.toHaveAttribute('data-testid')
  })

  it('is inert when disabled', async () => {
    await renderWithApp(BaseInput, { props: { disabled: true } })

    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('reveals and hides a password with a labelled toggle', async () => {
    const { container } = await renderWithApp(BaseInput, {
      props: { type: 'password', modelValue: 'secret' },
    })
    const field = container.querySelector('input')
    expect(field).toHaveAttribute('type', 'password')

    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(field).toHaveAttribute('type', 'text')

    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(field).toHaveAttribute('type', 'password')
  })

  it('has no toggle for other types', async () => {
    await renderWithApp(BaseInput)

    expect(screen.queryByRole('button')).toBeNull()
  })
})
