import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { RadioGroup, RadioGroupItem } from '@/shared/components/radio-group'

function Example() {
  return (
    <RadioGroup aria-label="Size" defaultValue="s">
      <RadioGroupItem value="s" aria-label="Small" />
      <RadioGroupItem value="m" aria-label="Medium" />
    </RadioGroup>
  )
}

describe('RadioGroup', () => {
  it('starts on the default and selects another on click', async () => {
    render(<Example />)
    expect(screen.getByRole('radiogroup', { name: 'Size' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Small' })).toBeChecked()

    await userEvent.click(screen.getByRole('radio', { name: 'Medium' }))

    expect(screen.getByRole('radio', { name: 'Medium' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Small' })).not.toBeChecked()
  })

  it('moves the selection with the arrow keys', async () => {
    render(<Example />)
    screen.getByRole('radio', { name: 'Small' }).focus()

    await userEvent.keyboard('{ArrowDown}')

    // Arrows move focus (roving tabindex); Space selects. jsdom skips the select-on-focus click.
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Medium' })).toHaveFocus()
    })
    await userEvent.keyboard(' ')
    expect(screen.getByRole('radio', { name: 'Medium' })).toBeChecked()
  })
})
