import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderWithApp } from '@/testing/render'

import AppSelect from './app-select.vue'

const OPTIONS = [
  { value: 'light', labelKey: 'theme.light' },
  { value: 'dark', labelKey: 'theme.dark' },
]

describe('AppSelect', () => {
  it('shows the label of the chosen option on the trigger', async () => {
    await renderWithApp(AppSelect, { props: { options: OPTIONS, modelValue: 'dark' } })

    expect(screen.getByRole('combobox')).toHaveTextContent('Dark')
  })

  it('opens a listbox of the translated options and emits the one chosen', async () => {
    const view = await renderWithApp(AppSelect, {
      props: { options: OPTIONS, modelValue: 'light' },
    })

    await userEvent.click(screen.getByRole('combobox'))
    const listbox = await screen.findByRole('listbox')
    await userEvent.click(within(listbox).getByRole('option', { name: 'Dark' }))

    expect(view.emitted('update:modelValue')).toEqual([['dark']])
  })

  it('chooses from the keyboard', async () => {
    const view = await renderWithApp(AppSelect, {
      props: { options: OPTIONS, modelValue: 'light' },
    })

    screen.getByRole('combobox').focus()
    await userEvent.keyboard('{Enter}')
    await screen.findByRole('listbox')
    await userEvent.keyboard('{ArrowDown}{Enter}')

    expect(view.emitted('update:modelValue')).toEqual([['dark']])
  })

  it('offers an empty choice when emptyKey is set, and emits the empty string for it', async () => {
    const view = await renderWithApp(AppSelect, {
      props: { options: OPTIONS, modelValue: 'dark', emptyKey: 'table.empty' },
    })

    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(await screen.findByRole('option', { name: 'Nothing to show yet' }))

    expect(view.emitted('update:modelValue')).toEqual([['']])
  })

  it('shows the empty choice for an empty value', async () => {
    await renderWithApp(AppSelect, {
      props: { options: OPTIONS, modelValue: '', emptyKey: 'table.empty' },
    })

    expect(screen.getByRole('combobox')).toHaveTextContent('Nothing to show yet')
  })

  it('does not open when disabled', async () => {
    await renderWithApp(AppSelect, {
      props: { options: OPTIONS, modelValue: 'light', disabled: true },
    })

    await userEvent.click(screen.getByRole('combobox'))

    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
