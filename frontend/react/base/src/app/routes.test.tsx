import { act, screen, waitFor } from '@testing-library/react'
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

const isHealth = (request: Request) => new URL(request.url).pathname === '/api/health'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('the route table', () => {
  it('renders the home route with the heading, the status badge and exactly one fetch', async () => {
    const fetchMock = stubApi({ 'GET /api/health': Response.json(HEALTH) })

    renderRoutes()

    expect(await screen.findByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument()
    expect(await screen.findByRole('status')).toHaveTextContent('API v1.2.3')
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeVisible()
    // The page header is a <header> too, so the shell is checked by its navigation.
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeVisible()
    await new Promise((resolve) => setTimeout(resolve, 50))
    // The session read, when the server has auth, is a different request.
    expect(fetchMock.mock.calls.filter(([request]) => isHealth(request))).toHaveLength(1)
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
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('status')).toHaveTextContent('API v1.2.3')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([request]) => isHealth(request))).toHaveLength(2)
  })

  it('refetches a rejected read inside the cache window, so Try again can recover', async () => {
    let healthy = true
    const fetchMock = stubApi({
      'GET /api/health': () => (healthy ? Response.json(HEALTH) : unavailable()),
    })
    const { router } = renderRoutes()
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('API v1.2.3')
    })

    // The refresh fails: the entry now holds an error next to its old, still fresh, timestamp.
    healthy = false
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    // The card's alert, not the toast the button raises with the same copy (it mounts a tick later).
    expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable right now/i)

    await act(() => router.navigate('/no/such/page'))
    await screen.findByRole('heading', { name: 'Page not found' })
    await act(() => router.navigate('/'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable right now/i)

    healthy = true
    const before = fetchMock.mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('API v1.2.3')
    })
    expect(fetchMock.mock.calls.length).toBeGreaterThan(before)
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
