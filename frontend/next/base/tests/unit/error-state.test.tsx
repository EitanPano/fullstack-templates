import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ErrorState } from '@/shared/ui/pattern/error-state'

describe('ErrorState', () => {
  it('shows the title and description as an alert', () => {
    render(<ErrorState title="Could not load" description="Try again in a moment." />)

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load')
    expect(screen.getByRole('alert')).toHaveTextContent('Try again in a moment.')
  })

  it('calls onRetry when the retry button is pressed', async () => {
    const onRetry = vi.fn()
    render(<ErrorState title="Could not load" onRetry={onRetry} />)

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('offers no retry button when there is nothing to retry', () => {
    render(<ErrorState title="Could not load" />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
