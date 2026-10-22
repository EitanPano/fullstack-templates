import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { RefreshButton } from '@/feature/health/ui/refresh-button'

// The toast library is a boundary: mocked, so the test asserts what the user is told.
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { toast } = await import('sonner')

describe('RefreshButton', () => {
  it('reports success when the action succeeds', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, data: undefined })
    render(<RefreshButton action={action} />)

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(action).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith('Status refreshed')
  })

  it('shows the action error with a recovery hint', async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, error: 'API unreachable' })
    render(<RefreshButton action={action} />)

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(toast.error).toHaveBeenCalledWith('API unreachable', {
      description: 'Start the API and try again.',
    })
  })
})
