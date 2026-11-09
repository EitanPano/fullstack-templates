import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as z from 'zod'

import BaseInput from '@/shared/components/base-input.vue'
import FormField from '@/shared/components/form-field.vue'
import { renderWithApp } from '@/testing/render'

import { match } from './match'
import { applyFieldErrors } from './server-errors'
import { useZodForm } from './zod-form'

const INITIAL = { email: '', password: '', confirm: '' }

// A credentials-like schema owned by this spec: the generated one exists only with auth and its
// email rule differs per server, so the spec never imports it.
const zCredentials = z.object({
  email: z
    .string()
    .max(254)
    .regex(/^[\w.+'-]+@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/),
  password: z.string().min(8).max(128),
})

type Form = ReturnType<typeof useZodForm<typeof zCredentials, typeof INITIAL>>

// A register-like form over the generated credentials schema, with the confirm rule.
function harness(
  onSubmit: (value: unknown) => void | Promise<void> = () => undefined,
  capture: (form: Form) => void = () => undefined,
) {
  return defineComponent({
    setup() {
      const form = useZodForm(zCredentials, INITIAL, [match('password', 'confirm')])
      capture(form)
      const field = (name: 'email' | 'password' | 'confirm', label: string) =>
        h(FormField, { label, error: form.errorText(name) }, () =>
          h(BaseInput, {
            modelValue: form.values[name],
            'onUpdate:modelValue': (value: string | number | null) => {
              form.values[name] = String(value ?? '')
            },
            onBlur: () => {
              form.touch(name)
            },
          }),
        )
      return () =>
        h(
          'form',
          {
            onSubmit: (event: Event) => {
              event.preventDefault()
              void form.submit((value) => onSubmit(value))
            },
          },
          [
            field('email', 'Email'),
            field('password', 'Password'),
            field('confirm', 'Confirm'),
            h('button', { type: 'submit' }, 'Go'),
          ],
        )
    },
  })
}

describe('useZodForm', () => {
  it('shows no error before a field is touched or the form submitted', async () => {
    await renderWithApp(harness())

    expect(screen.queryByText('Enter a value in the expected format')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid')
  })

  it('shows the first error of a field after it lost focus, with the schema numbers in the copy', async () => {
    await renderWithApp(harness())
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Email'), 'nope')
    await user.tab()
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.tab()

    expect(screen.getByText('Enter a value in the expected format')).toBeInTheDocument()
    expect(screen.getByText('Enter at least 8 characters')).toBeInTheDocument()
  })

  it('reports a regex-limited email as the pattern error, not the email one', async () => {
    await renderWithApp(harness())
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Email'), 'nope')
    await user.tab()

    expect(screen.queryByText('Enter a valid email address')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
  })

  it('ties the error to its control with aria-describedby and clears both when fixed', async () => {
    await renderWithApp(harness())
    const user = userEvent.setup()
    const email = screen.getByLabelText('Email')

    await user.type(email, 'nope')
    await user.tab()
    const describedBy = email.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy ?? '')).toHaveTextContent(
      'Enter a value in the expected format',
    )

    await user.clear(email)
    await user.type(email, 'ada@example.com')

    expect(email).not.toHaveAttribute('aria-invalid')
    expect(email).not.toHaveAttribute('aria-describedby')
  })

  it('shows every error on submit and does not call the handler', async () => {
    const onSubmit = vi.fn()
    await renderWithApp(harness(onSubmit))

    await userEvent.setup().click(screen.getByRole('button', { name: 'Go' }))

    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('calls the handler with the parsed value, without a field the schema does not know', async () => {
    const onSubmit = vi.fn()
    await renderWithApp(harness(onSubmit))
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'correct horse')
    await user.type(screen.getByLabelText('Confirm'), 'correct horse')
    await user.click(screen.getByRole('button', { name: 'Go' }))

    expect(onSubmit).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'correct horse' })
  })

  it('ignores a second submit while the first handler is still running', async () => {
    let release: () => void = () => undefined
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    let form: Form | undefined
    await renderWithApp(
      harness(onSubmit, (captured) => {
        form = captured
      }),
    )
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'correct horse')
    await user.type(screen.getByLabelText('Confirm'), 'correct horse')

    await user.click(screen.getByRole('button', { name: 'Go' }))
    await user.click(screen.getByRole('button', { name: 'Go' }))

    expect(onSubmit).toHaveBeenCalledOnce()
    expect(form?.submitting.value).toBe(true)
    release()
    await vi.waitFor(() => {
      expect(form?.submitting.value).toBe(false)
    })
  })

  it('puts the match error on the confirm field and keeps the handler away', async () => {
    const onSubmit = vi.fn()
    await renderWithApp(harness(onSubmit))
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'correct horse')
    await user.type(screen.getByLabelText('Confirm'), 'other horse!')
    await user.click(screen.getByRole('button', { name: 'Go' }))

    expect(screen.getByText('The values do not match')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm')).toHaveAttribute('aria-invalid', 'true')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('writes a server field error by path, marks it touched and clears it on edit', async () => {
    let form: Form | undefined
    await renderWithApp(
      harness(undefined, (captured) => {
        form = captured
      }),
    )
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'ada@example.com')

    const unmapped = applyFieldErrors(form as Form, {
      code: 'validation_failed',
      fieldErrors: { email: ['invalid'], 'nope.deep': ['invalid'] },
    })

    await vi.waitFor(() => {
      expect(screen.getByText('This value is not valid')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(unmapped).toEqual(['nope.deep'])

    await user.type(screen.getByLabelText('Email'), 'x')

    expect(screen.queryByText('This value is not valid')).not.toBeInTheDocument()
  })

  it('resets values, touched fields, the submitted flag and server errors', async () => {
    let form: Form | undefined
    await renderWithApp(
      harness(undefined, (captured) => {
        form = captured
      }),
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Go' }))
    expect(form?.submitted.value).toBe(true)

    form?.reset()

    await vi.waitFor(() => {
      expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid')
    })
    expect(form?.submitted.value).toBe(false)
  })

  it('reports validity and the paths of issues no field has', async () => {
    let form: ReturnType<typeof useZodForm<typeof zCredentials, { email: string }>> | undefined
    const probe = {
      setup() {
        form = useZodForm(zCredentials, { email: '' })
        return () => null
      },
    }
    await renderWithApp(probe)

    expect(form?.valid.value).toBe(false)
    expect(form?.unmapped.value).toEqual(['password'])
  })
})
