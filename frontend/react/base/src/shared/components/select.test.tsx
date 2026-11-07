import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/select'

function Example() {
  const [value, setValue] = useState('')
  return (
    <>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger aria-label="Plan">
          <SelectValue placeholder="Choose" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="free">Free</SelectItem>
          <SelectItem value="pro">Pro</SelectItem>
        </SelectContent>
      </Select>
      <output>{value}</output>
    </>
  )
}

describe('Select', () => {
  it('shows the placeholder, lists the options and sets the value on click', async () => {
    render(<Example />)
    const trigger = screen.getByRole('combobox', { name: 'Plan' })
    expect(trigger).toHaveTextContent('Choose')
    expect(trigger).toHaveClass('select__trigger')

    await userEvent.click(trigger)
    expect(await screen.findAllByRole('option')).toHaveLength(2)
    await userEvent.click(screen.getByRole('option', { name: 'Pro' }))

    expect(trigger).toHaveTextContent('Pro')
    expect(screen.getByRole('status')).toHaveTextContent('pro')
  })

  it('opens and picks with the keyboard', async () => {
    render(<Example />)
    screen.getByRole('combobox', { name: 'Plan' }).focus()

    await userEvent.keyboard('{Enter}')
    await screen.findByRole('listbox')
    await userEvent.keyboard('{ArrowDown}{Enter}')

    expect(screen.getByRole('status')).toHaveTextContent('pro')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
