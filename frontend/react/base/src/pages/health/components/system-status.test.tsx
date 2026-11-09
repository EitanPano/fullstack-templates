import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SystemStatus } from '@/pages/health/components/system-status'
import { createStore } from '@/store'
import { stubApi } from '@/testing/stub-api'

const HEALTH = { status: 'ok', uptimeSeconds: 12, version: '1.2.3' }
const unavailable = () =>
  Response.json({ error: { code: 'upstream_unavailable', message: 'x' } }, { status: 503 })

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

function renderCard() {
  return render(
    <Provider store={createStore()}>
      <SystemStatus />
    </Provider>,
  )
}

describe('SystemStatus', () => {
  it('shows the skeleton while loading, then the badge', async () => {
    stubApi({ 'GET /api/health': Response.json(HEALTH) })

    renderCard()

    expect(screen.getByLabelText('Loading system status')).toHaveAttribute('aria-busy', 'true')
    expect(await screen.findByRole('status')).toHaveTextContent('API v1.2.3, up 12s')
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled()
  })

  it('renders an error state on failure and Try again refetches', async () => {
    let healthy = false
    const fetchMock = stubApi({
      'GET /api/health': () => (healthy ? Response.json(HEALTH) : unavailable()),
    })
    renderCard()
    expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable right now/i)

    healthy = true
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('status')).toHaveTextContent('API v1.2.3')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('replaces the badge with the error state when a refresh fails after a good load', async () => {
    let healthy = true
    stubApi({ 'GET /api/health': () => (healthy ? Response.json(HEALTH) : unavailable()) })
    renderCard()
    expect(await screen.findByRole('status')).toHaveTextContent('API v1.2.3')

    healthy = false
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable right now/i)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
