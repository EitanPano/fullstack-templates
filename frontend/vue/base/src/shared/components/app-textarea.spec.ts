import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderWithApp } from '@/testing/render'

import AppTextarea from './app-textarea.vue'

describe('AppTextarea', () => {
  it('shows the value and emits what the user types', async () => {
    const view = await renderWithApp(AppTextarea, { props: { modelValue: 'hi' } })
    const box = screen.getByRole('textbox')
    expect(box).toHaveValue('hi')

    await userEvent.type(box, '!')

    expect(view.emitted('update:modelValue').at(-1)).toEqual(['hi!'])
  })

  it('counts the characters left when maxlength is set, and ties the count to the field', async () => {
    const { container } = await renderWithApp(AppTextarea, {
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
    const { container } = await renderWithApp(AppTextarea, { props: { modelValue: 'abc' } })

    expect(container.querySelector('.control__counter')).toBeNull()
  })

  it('emits blur', async () => {
    const view = await renderWithApp(AppTextarea)

    await userEvent.click(screen.getByRole('textbox'))
    await userEvent.tab()

    expect(view.emitted('blur')).toHaveLength(1)
  })
})
