import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RefreshHealthButton } from '@/feature/refresh-health/ui/refresh-health-button'

// The action and the toast library are boundaries: mocked, so the test asserts what the user
// is told after the action resolves.
vi.mock('@/feature/refresh-health/server/action', () => ({ refreshHealth: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { refreshHealth } = await import('@/feature/refresh-health/server/action')
const { toast } = await import('sonner')

describe('RefreshHealthButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports success from the handler after the action resolves', async () => {
    vi.mocked(refreshHealth).mockResolvedValue({ data: { refreshed: true } })
    render(<RefreshHealthButton />)

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(refreshHealth).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith('Status refreshed')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('shows the action error with a recovery hint', async () => {
    vi.mocked(refreshHealth).mockResolvedValue({ serverError: "Can't reach the server." })
    render(<RefreshHealthButton />)

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(toast.error).toHaveBeenCalledWith("Can't reach the server.", {
      description: 'Start the API and try again.',
    })
    expect(toast.success).not.toHaveBeenCalled()
  })
})
