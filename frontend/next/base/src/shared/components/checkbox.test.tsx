import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Checkbox } from '@/shared/components/checkbox'

describe('Checkbox', () => {
  it('toggles on click and on Space, reporting the state', async () => {
    const onCheckedChange = vi.fn()
    render(<Checkbox aria-label="Terms" onCheckedChange={onCheckedChange} />)
    const box = screen.getByRole('checkbox', { name: 'Terms' })
    expect(box).toHaveAttribute('data-state', 'unchecked')

    await userEvent.click(box)
    expect(box).toHaveAttribute('aria-checked', 'true')
    await userEvent.keyboard(' ')

    expect(onCheckedChange).toHaveBeenNthCalledWith(1, true)
    expect(onCheckedChange).toHaveBeenNthCalledWith(2, false)
  })

  it('does not toggle when disabled', async () => {
    render(<Checkbox aria-label="Terms" disabled />)

    await userEvent.click(screen.getByRole('checkbox'))

    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'false')
  })
})
