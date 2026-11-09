import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RefreshHealthButton } from '@/pages/health/components/refresh-health-button'
import { createStore } from '@/store'
import { stubApi } from '@/testing/stub-api'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const HEALTH = { status: 'ok', uptimeSeconds: 12, version: '1.2.3' }

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

const renderButton = () =>
  render(
    <Provider store={createStore()}>
      <RefreshHealthButton />
    </Provider>,
  )

// A request the test settles by hand, so it can look at the moment before the answer.
function deferred() {
  let release: (response: Response) => void = () => undefined
  const handler = () => new Promise<Response>((resolve) => (release = resolve))
  return {
    handler,
    release: (response: Response) => {
      release(response)
    },
  }
}

const unavailable = () =>
  Response.json({ error: { code: 'upstream_unavailable', message: 'x' } }, { status: 503 })

describe('RefreshHealthButton', () => {
  it('toasts the success copy only after the request resolves', async () => {
    const pending = deferred()
    stubApi({ 'GET /api/health': pending.handler })
    renderButton()

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(toast.success).not.toHaveBeenCalled()

    pending.release(Response.json(HEALTH))
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Status refreshed')
    })
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('toasts our copy and the hint only after the API answers with a failure', async () => {
    const pending = deferred()
    stubApi({ 'GET /api/health': pending.handler })
    renderButton()

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(toast.error).not.toHaveBeenCalled()

    pending.release(unavailable())
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'The service is unavailable right now. Try again in a moment.',
        { description: 'Start the API and try again.' },
      )
    })
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('is disabled and spinning while the request is pending', async () => {
    const pending = deferred()
    stubApi({ 'GET /api/health': pending.handler })
    const { container } = renderButton()

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled()
    expect(container.querySelector('.refresh-icon')).toHaveClass('refresh-icon--spinning')
    pending.release(Response.json(HEALTH))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled()
    })
    expect(container.querySelector('.refresh-icon')).not.toHaveClass('refresh-icon--spinning')
  })
})
