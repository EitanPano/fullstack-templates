import { zodResolver } from '@hookform/resolvers/zod'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { CheckboxField } from '@/shared/ui/form/checkbox-field'
import { Form } from '@/shared/ui/form/form'
import { NumberField } from '@/shared/ui/form/number-field'
import { PasswordField } from '@/shared/ui/form/password-field'
import { SelectField } from '@/shared/ui/form/select-field'
import { TextField } from '@/shared/ui/form/text-field'
import { TextareaField } from '@/shared/ui/form/textarea-field'

const schema = z.object({
  email: z.string().pipe(z.email()),
  note: z.string().min(3),
  seats: z.number().int().gte(1),
  plan: z.string().min(1, 'Pick a plan'),
  terms: z.literal(true, { error: 'Accept the terms' }),
  password: z.string().min(8),
})
type Values = z.input<typeof schema>

function Harness({
  onValid = vi.fn(),
  setup,
}: {
  onValid?: (values: z.output<typeof schema>) => void
  setup?: (form: ReturnType<typeof useForm<Values, unknown, z.output<typeof schema>>>) => void
}) {
  const form = useForm<Values, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', note: '', plan: '', password: '' },
  })
  setup?.(form)
  return (
    <Form form={form} onSubmit={form.handleSubmit(onValid)}>
      <TextField name="email" label="Email" description="We never share it." type="email" />
      <TextareaField name="note" label="Note" />
      <NumberField name="seats" label="Seats" />
      <SelectField
        name="plan"
        label="Plan"
        placeholder="Choose"
        options={[
          { value: 'free', label: 'Free' },
          { value: 'pro', label: 'Pro' },
        ]}
      />
      <CheckboxField name="terms" label="I accept the terms" />
      <PasswordField name="password" label="Password" />
      <button type="submit">Save</button>
    </Form>
  )
}

describe('form field bindings', () => {
  it('labels each control and wires the description through aria-describedby', () => {
    render(<Harness />)

    const email = screen.getByLabelText('Email')
    const description = screen.getByText('We never share it.')
    expect(email).toHaveAttribute('aria-describedby', description.id)
    expect(email).not.toHaveAttribute('aria-invalid')
    expect(screen.getByLabelText('Note')).toBeInTheDocument()
    expect(screen.getByLabelText('Seats')).toHaveAttribute('type', 'number')
    expect(screen.getByRole('checkbox', { name: 'I accept the terms' })).toBeInTheDocument()
  })

  it('shows an error on its own field only, with aria-invalid and aria-describedby', async () => {
    render(<Harness />)

    await userEvent.type(screen.getByLabelText('Email'), 'nope')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    const email = screen.getByLabelText('Email')
    expect(email).toHaveAttribute('aria-invalid', 'true')
    const describedBy = (email.getAttribute('aria-describedby') ?? '').split(' ')
    const alert = describedBy
      .map((id) => document.getElementById(id))
      .find((element) => element?.getAttribute('role') === 'alert')
    expect(alert).toHaveTextContent('Enter a valid email address')
    // The description stays linked beside the error.
    expect(describedBy).toContain(screen.getByText('We never share it.').id)
  })

  it('keeps the error link when the caller passes its own aria-describedby', async () => {
    function Custom() {
      const form = useForm({
        resolver: zodResolver(z.object({ email: z.string().min(1), note: z.string() })),
        defaultValues: { email: '', note: 'x' },
      })
      return (
        <Form form={form} onSubmit={form.handleSubmit(vi.fn())}>
          <TextField name="email" label="Email" aria-describedby="hint" />
          <TextareaField name="note" label="Note" aria-describedby="hint" />
          <button type="submit">Save</button>
        </Form>
      )
    }
    render(<Custom />)

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    const email = screen.getByLabelText('Email')
    const ids = (email.getAttribute('aria-describedby') ?? '').split(' ')
    expect(ids).toContain('hint')
    expect(ids).toHaveLength(2)
    expect(document.getElementById(ids.find((id) => id !== 'hint') ?? '')).toHaveAttribute(
      'role',
      'alert',
    )
    // A control without an error of its own keeps only the caller's id.
    expect(screen.getByLabelText('Note')).toHaveAttribute('aria-describedby', 'hint')
  })

  it('marks every invalid control and no valid one', async () => {
    render(<Harness />)

    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid')
    expect(screen.getByLabelText('Note')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Seats')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('combobox', { name: 'Plan' })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Pick a plan')).toHaveAttribute('role', 'alert')
    expect(screen.getByText('Accept the terms')).toHaveAttribute('role', 'alert')
    // One alert per invalid field, never a repeat.
    expect(screen.getAllByRole('alert')).toHaveLength(5)
  })

  it('submits typed values: a number for the number field, a boolean for the checkbox', async () => {
    const onValid = vi.fn()
    render(<Harness onValid={onValid} />)

    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('Note'), 'hello')
    await userEvent.type(screen.getByLabelText('Seats'), '3')
    await userEvent.click(screen.getByRole('combobox', { name: 'Plan' }))
    await userEvent.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: 'Pro' }),
    )
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onValid).toHaveBeenCalledTimes(1)
    expect(onValid.mock.calls[0]?.[0]).toEqual({
      email: 'a@b.co',
      note: 'hello',
      seats: 3,
      plan: 'pro',
      terms: true,
      password: 'correct horse',
    })
  })

  it('treats an empty number field as missing, not as NaN or 0', async () => {
    render(<Harness />)

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByLabelText('Seats')).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows an error the server put on a field, the way the action adapter does', async () => {
    let setError: ((name: 'email', message: string) => void) | undefined
    render(
      <Harness
        setup={(form) => {
          setError = (name, message) => {
            form.setError(name, { message })
          }
        }}
      />,
    )

    await vi.waitFor(() => {
      expect(setError).toBeDefined()
    })
    act(() => setError?.('email', 'That email is already registered.'))

    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('That email is already registered.')).toHaveAttribute('role', 'alert')
  })

  it('PasswordField hides the password until asked, and the toggle says what it does', async () => {
    render(<Harness />)
    const password = screen.getByLabelText('Password')
    expect(password).toHaveAttribute('type', 'password')

    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))

    expect(password).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
