import { zodResolver } from '@hookform/resolvers/zod'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { DateTimeField } from '@/shared/ui/form/date-time-field'
import { Form } from '@/shared/ui/form/form'

// The form holds an instant (an ISO string with Z, what the API takes); the control shows and
// accepts wall time in the zone it is given. Europe/London changes on 2026-03-29 and 2026-10-25.
const schema = z.object({ startsAt: z.iso.datetime() })

function Harness({
  onValid = vi.fn(),
  defaultValue = '',
}: {
  onValid?: (values: z.output<typeof schema>) => void
  defaultValue?: string
}) {
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { startsAt: defaultValue },
  })
  return (
    <Form form={form} onSubmit={form.handleSubmit(onValid)}>
      <DateTimeField name="startsAt" label="Starts" timeZone="Europe/London" />
      <button type="submit">Save</button>
    </Form>
  )
}

const type = (value: string) => {
  fireEvent.change(screen.getByLabelText('Starts'), { target: { value } })
}

describe('DateTimeField', () => {
  it('names the zone it reads the time in', () => {
    render(<Harness />)

    expect(screen.getByText(/Europe\/London/)).toBeInTheDocument()
  })

  it('submits the instant for the wall time typed in the zone', async () => {
    const onValid = vi.fn()
    render(<Harness onValid={onValid} />)

    type('2026-07-15T09:30')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onValid.mock.calls[0]?.[0]).toEqual({ startsAt: '2026-07-15T08:30:00.000Z' })
  })

  it('shows an existing instant as wall time in the zone', () => {
    render(<Harness defaultValue="2026-07-15T08:30:00.000Z" />)

    expect(screen.getByLabelText('Starts')).toHaveValue('2026-07-15T09:30')
  })

  it('refuses a time inside the spring-forward gap on the field, and blocks the submit', async () => {
    const onValid = vi.fn()
    render(<Harness onValid={onValid} />)

    type('2026-03-29T01:30')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    const field = screen.getByLabelText('Starts')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent("doesn't exist")
    expect(field).toHaveValue('2026-03-29T01:30')
    expect(onValid).not.toHaveBeenCalled()
  })

  it('takes the earlier instant for an ambiguous time', async () => {
    const onValid = vi.fn()
    render(<Harness onValid={onValid} />)

    type('2026-10-25T01:30')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onValid.mock.calls[0]?.[0]).toEqual({ startsAt: '2026-10-25T00:30:00.000Z' })
  })

  it('clears the gap error once the time is fixed', () => {
    render(<Harness />)

    type('2026-03-29T01:30')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    type('2026-03-29T02:30')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Starts')).not.toHaveAttribute('aria-invalid')
  })
})
