import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { USER, envelope } from '@/testing/auth-fixtures'
import { renderRoutes } from '@/testing/render-routes'
import { stubApi } from '@/testing/stub-api'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('the user routes', () => {
  it('costs a visitor exactly one session request, and the header shows Sign in', async () => {
    const fetchMock = stubApi({
      'GET /api/health': Response.json({ status: 'ok', uptimeSeconds: 1, version: '1' }),
      'GET /api/user/me': () => envelope('unauthenticated', 401),
    })

    renderRoutes()

    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeVisible()
    await new Promise((resolve) => setTimeout(resolve, 100))
    const session = fetchMock.mock.calls.filter(
      ([request]) => new URL(request.url).pathname === '/api/user/me',
    )
    expect(session).toHaveLength(1)
  })

  it('sends a visitor from /profile to sign-in with the way back', async () => {
    stubApi({ 'GET /api/user/me': () => envelope('unauthenticated', 401) })

    const { router } = renderRoutes({ initialEntries: ['/profile'] })

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/sign-in')
    })
    expect(router.state.location.search).toBe('?next=%2Fprofile')
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
  })

  it('shows an account its profile, with the email and the role', async () => {
    const fetchMock = stubApi({ 'GET /api/user/me': Response.json(USER) })

    renderRoutes({ initialEntries: ['/profile'] })

    const main = await screen.findByRole('main')
    expect(await within(main).findByRole('heading', { level: 1, name: 'Profile' })).toBeVisible()
    expect(await within(main).findByText(USER.email)).toBeVisible()
    expect(within(main).getByText('user')).toBeVisible()
    // The loaders and the account menu share one cache entry.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('renders the forbidden page inside the shell', async () => {
    stubApi({ 'GET /api/user/me': Response.json(USER) })

    renderRoutes({ initialEntries: ['/forbidden'] })

    expect(await screen.findByRole('heading', { level: 1, name: 'Access denied' })).toBeVisible()
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
  })
})
