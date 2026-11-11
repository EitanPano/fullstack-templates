import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ErrorState } from '@/shared/components/error-state/error-state'

describe('ErrorState', () => {
  it('shows the title and description as an alert', () => {
    render(<ErrorState title="Broke" description="Try later" />)

    expect(screen.getByRole('alert')).toHaveTextContent('Broke')
    expect(screen.getByRole('alert')).toHaveTextContent('Try later')
  })

  it('calls the handler from the Try again button', async () => {
    const onRetry = vi.fn()
    render(<ErrorState title="Broke" onRetry={onRetry} />)

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders no button without a handler', () => {
    render(<ErrorState title="Broke" />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
