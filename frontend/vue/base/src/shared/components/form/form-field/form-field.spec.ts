import { screen } from '@testing-library/vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'

import { renderWithApp } from '@/testing/render'

import BaseInput from '../base-input.vue'
import FormField from './form-field.vue'

// A field with an base-input in its slot.
const Host = defineComponent({
  props: {
    label: { type: String, default: undefined },
    hint: { type: String, default: undefined },
    error: { type: String, default: undefined },
  },
  setup: (props) => () => h(FormField, { ...props }, () => h(BaseInput)),
})

describe('FormField', () => {
  it('labels the control it wraps, by id', async () => {
    await renderWithApp(FormField, { props: { label: 'Email' } })

    const label = screen.getByText('Email')
    expect(label.tagName).toBe('LABEL')
    expect(label).toHaveAttribute('for')
  })

  it('shows the hint and the error, the error as a polite live region that is always there', async () => {
    const view = await renderWithApp(FormField, { props: { label: 'Email', hint: 'Work address' } })
    const error = view.container.querySelector('.form-field__error')
    expect(error).toHaveAttribute('aria-live', 'polite')
    expect(error).toBeEmptyDOMElement()
    expect(screen.getByText('Work address')).toHaveClass('form-field__hint')

    await view.rerender({ error: 'Enter a valid email address' })

    expect(error).toHaveTextContent('Enter a valid email address')
    expect(view.container.querySelector('.form-field')).toHaveClass('form-field--invalid')
  })

  it('hands its id, aria-invalid and aria-describedby to the control inside', async () => {
    const { container } = await renderWithApp(Host, {
      props: { label: 'Email', hint: 'Work address', error: 'Required' },
    })

    const input = container.querySelector('input')
    const label = screen.getByText('Email')
    expect(input).toHaveAttribute('id', label.getAttribute('for'))
    expect(input).toHaveAttribute('aria-invalid', 'true')
    const describedBy = input?.getAttribute('aria-describedby') ?? ''
    expect(describedBy).toContain('-hint')
    expect(describedBy).toContain('-error')
  })

  it('leaves the control unflagged while there is no error', async () => {
    const { container } = await renderWithApp(Host, { props: { label: 'Email' } })

    const input = container.querySelector('input')
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).not.toHaveAttribute('aria-describedby')
  })
})
