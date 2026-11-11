import userEvent from '@testing-library/user-event'
import { screen, within } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import { renderWithApp } from '@/testing/render'

import BaseInput from './base-input.vue'
import BaseTextarea from './base-textarea.vue'
import BaseSelect from './base-select.vue'
import BaseCheckbox from './base-checkbox.vue'

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

describe('AppTextarea', () => {
  it('shows the value and emits what the user types', async () => {
    const view = await renderWithApp(BaseTextarea, { props: { modelValue: 'hi' } })
    const box = screen.getByRole('textbox')
    expect(box).toHaveValue('hi')

    await userEvent.type(box, '!')

    expect(view.emitted('update:modelValue').at(-1)).toEqual(['hi!'])
  })

  it('counts the characters left when maxlength is set, and ties the count to the field', async () => {
    const { container } = await renderWithApp(BaseTextarea, {
      props: { modelValue: 'abc', maxlength: 10 },
    })

    expect(screen.getByText('7 characters left')).toBeInTheDocument()
    const counter = container.querySelector('.control__counter')
    expect(screen.getByRole('textbox')).toHaveAttribute(
      'aria-describedby',
      expect.stringContaining(counter?.id ?? 'missing'),
    )
  })

  it('shows no counter without a maxlength', async () => {
    const { container } = await renderWithApp(BaseTextarea, { props: { modelValue: 'abc' } })

    expect(container.querySelector('.control__counter')).toBeNull()
  })

  it('emits blur', async () => {
    const view = await renderWithApp(BaseTextarea)

    await userEvent.click(screen.getByRole('textbox'))
    await userEvent.tab()

    expect(view.emitted('blur')).toHaveLength(1)
  })
})

const OPTIONS = [
  { value: 'light', labelKey: 'theme.light' },
  { value: 'dark', labelKey: 'theme.dark' },
]

describe('AppSelect', () => {
  it('shows the label of the chosen option on the trigger', async () => {
    await renderWithApp(BaseSelect, { props: { options: OPTIONS, modelValue: 'dark' } })

    expect(screen.getByRole('combobox')).toHaveTextContent('Dark')
  })

  it('opens a listbox of the translated options and emits the one chosen', async () => {
    const view = await renderWithApp(BaseSelect, {
      props: { options: OPTIONS, modelValue: 'light' },
    })

    await userEvent.click(screen.getByRole('combobox'))
    const listbox = await screen.findByRole('listbox')
    await userEvent.click(within(listbox).getByRole('option', { name: 'Dark' }))

    expect(view.emitted('update:modelValue')).toEqual([['dark']])
  })

  it('chooses from the keyboard', async () => {
    const view = await renderWithApp(BaseSelect, {
      props: { options: OPTIONS, modelValue: 'light' },
    })

    screen.getByRole('combobox').focus()
    await userEvent.keyboard('{Enter}')
    await screen.findByRole('listbox')
    await userEvent.keyboard('{ArrowDown}{Enter}')

    expect(view.emitted('update:modelValue')).toEqual([['dark']])
  })

  it('offers an empty choice when emptyKey is set, and emits the empty string for it', async () => {
    const view = await renderWithApp(BaseSelect, {
      props: { options: OPTIONS, modelValue: 'dark', emptyKey: 'table.empty' },
    })

    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(await screen.findByRole('option', { name: 'Nothing to show yet' }))

    expect(view.emitted('update:modelValue')).toEqual([['']])
  })

  it('shows the empty choice for an empty value', async () => {
    await renderWithApp(BaseSelect, {
      props: { options: OPTIONS, modelValue: '', emptyKey: 'table.empty' },
    })

    expect(screen.getByRole('combobox')).toHaveTextContent('Nothing to show yet')
  })

  it('does not open when disabled', async () => {
    await renderWithApp(BaseSelect, {
      props: { options: OPTIONS, modelValue: 'light', disabled: true },
    })

    await userEvent.click(screen.getByRole('combobox'))

    expect(screen.queryByRole('listbox')).toBeNull()
  })
})

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
