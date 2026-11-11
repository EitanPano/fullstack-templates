import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import userEvent from '@testing-library/user-event'
import { hasSessionHint, setSessionHint } from '@/core/auth/session-hint'
import { SESSION, USER, envelope } from '@/testing/auth-fixtures'
import { renderRoutes } from '@/testing/render-routes'
import { stubApi } from '@/testing/stub-api'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('the user routes', () => {
  it('costs a visitor exactly one session request on the guarded page', async () => {
    const fetchMock = stubApi({ 'GET /api/user/me': () => envelope('unauthenticated', 401) })

    renderRoutes({ initialEntries: ['/profile'] })

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
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

  it('renders the forbidden page inside main', async () => {
    stubApi({ 'GET /api/user/me': Response.json(USER) })

    renderRoutes({ initialEntries: ['/forbidden'] })

    expect(await screen.findByRole('heading', { level: 1, name: 'Access denied' })).toBeVisible()
    expect(within(screen.getByRole('main')).getByText('Access denied')).toBeVisible()
  })
  it('signs out from /profile and lands on the sign-in screen, not the home page', async () => {
    setSessionHint()
    const user = userEvent.setup()
    // The API forgets the session when it is revoked, as the real one does.
    let revoked = false
    stubApi({
      'GET /api/user/me': () => (revoked ? envelope('unauthenticated', 401) : Response.json(USER)),
      'POST /api/auth/logout': () => {
        revoked = true
        return new Response(null, { status: 204 })
      },
    })

    const { router } = renderRoutes({ initialEntries: ['/profile'] })
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
    expect(router.state.location.pathname).toBe('/sign-in')
    expect(hasSessionHint()).toBe(false)
  })
  it('sends a visitor to sign-in and back to /profile after signing in', async () => {
    const user = userEvent.setup()
    let signedIn = false
    stubApi({
      'GET /api/user/me': () => (signedIn ? Response.json(USER) : envelope('unauthenticated', 401)),
      'POST /api/auth/login': () => {
        signedIn = true
        return Response.json(SESSION)
      },
    })

    const { router } = renderRoutes({ initialEntries: ['/profile'] })
    await screen.findByRole('heading', { level: 1, name: 'Sign in' })
    expect(router.state.location.search).toBe('?next=%2Fprofile')
    await user.type(screen.getByLabelText('Email'), USER.email)
    await user.type(screen.getByLabelText('Password'), 'correct horse')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Profile' })).toBeVisible()
    expect(router.state.location.pathname).toBe('/profile')
    expect(within(screen.getByRole('main')).getByText(USER.email)).toBeVisible()
  })
  it('costs an account on a direct /profile visit exactly one session request', async () => {
    const fetchMock = stubApi({ 'GET /api/user/me': Response.json(USER) })

    renderRoutes({ initialEntries: ['/profile'] })

    expect(await screen.findByRole('heading', { level: 1, name: 'Profile' })).toBeVisible()
    await new Promise((resolve) => setTimeout(resolve, 100))
    const session = fetchMock.mock.calls.filter(
      ([request]) => new URL(request.url).pathname === '/api/user/me',
    )
    expect(session).toHaveLength(1)
  })
})
