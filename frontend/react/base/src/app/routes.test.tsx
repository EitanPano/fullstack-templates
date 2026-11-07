import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { stubApi } from '@/testing/stub-api'
import { renderRoutes } from '@/testing/render-routes'

const HEALTH = { status: 'ok', uptimeSeconds: 12, version: '1.2.3' }
const unavailable = () =>
  Response.json(
    { error: { code: 'upstream_unavailable', message: 'db down: hunter2' }, requestId: 'r1' },
    { status: 503 },
  )

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('the route table', () => {
  it('renders the home route with the version and exactly one fetch', async () => {
    const fetchMock = stubApi({ 'GET /api/health': Response.json(HEALTH) })

    renderRoutes()

    expect(await screen.findByText(/1\.2\.3/)).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeVisible()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('renders the group boundary on a 503, inside the shell, without the server text', async () => {
    stubApi({ 'GET /api/health': unavailable })

    renderRoutes()

    expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable right now/i)
    expect(screen.getByRole('banner')).toBeVisible()
    expect(document.body).not.toHaveTextContent('hunter2')
  })

  it('retries with a click and renders the page once the API answers', async () => {
    let healthy = false
    const fetchMock = stubApi({
      'GET /api/health': () => (healthy ? Response.json(HEALTH) : unavailable()),
    })
    renderRoutes()
    await screen.findByRole('alert')

    healthy = true
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText(/1\.2\.3/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('renders Page not found inside the shell for an unknown URL', async () => {
    stubApi({})

    renderRoutes({ initialEntries: ['/no/such/page'] })

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeVisible()
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Primary' })).toBeVisible()
    })
  })
})
