import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Switch } from '@/shared/components/form/switch/switch'

describe('Switch', () => {
  it('toggles on click and Space', async () => {
    render(<Switch aria-label="Notify me" />)
    const control = screen.getByRole('switch', { name: 'Notify me' })
    expect(control).toHaveAttribute('aria-checked', 'false')

    await userEvent.click(control)
    expect(control).toHaveAttribute('aria-checked', 'true')
    await userEvent.keyboard(' ')

    expect(control).toHaveAttribute('aria-checked', 'false')
  })

  it('does not toggle when disabled', async () => {
    render(<Switch aria-label="Notify me" disabled />)

    await userEvent.click(screen.getByRole('switch'))

    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  })
})
