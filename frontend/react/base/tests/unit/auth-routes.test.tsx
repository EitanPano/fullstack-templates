import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderRoutes } from './render-routes'
import { USER, envelope, stubApi } from './support'

const HEALTH = { status: 'ok', version: '1.2.3', uptimeSeconds: 42 }

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the guarded and account routes', () => {
  it('sends a visitor from /profile to sign-in with the way back', async () => {
    stubApi({ 'GET /api/user/me': envelope('unauthenticated', 401) })

    const router = renderRoutes('/profile')

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/sign-in')
    })
    expect(router.state.location.search).toBe('?next=%2Fprofile')
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
  })

  it('shows an account its profile', async () => {
    stubApi({ 'GET /api/user/me': Response.json(USER) })

    renderRoutes('/profile')

    const main = await screen.findByRole('main')
    expect(await within(main).findByRole('heading', { level: 1, name: 'Profile' })).toBeVisible()
    expect(await within(main).findByText(USER.email)).toBeVisible()
  })

  it.each(['/sign-in', '/sign-up'])('keeps a signed-in account out of %s', async (path) => {
    stubApi({ 'GET /api/user/me': Response.json(USER), 'GET /api/health': Response.json(HEALTH) })

    const router = renderRoutes(path)

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/')
    })
  })

  it('renders the sign-up screen for a visitor, without the shell', async () => {
    stubApi({ 'GET /api/user/me': envelope('unauthenticated', 401) })

    renderRoutes('/sign-up')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Create your account' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(screen.getAllByRole('main')).toHaveLength(1)
  })

  it('renders the forbidden page inside the shell', async () => {
    stubApi({ 'GET /api/user/me': Response.json(USER) })

    renderRoutes('/forbidden')

    expect(await screen.findByRole('heading', { level: 1, name: 'Access denied' })).toBeVisible()
    // A PageHeader is a <header> too, so the shell is recognised by its navigation.
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
  })
})

describe('the group fallback of the account screens', () => {
  it('shows the auth skeleton, without the shell, while the first loader runs', async () => {
    let release: (response: Response) => void = () => undefined
    stubApi({
      'GET /api/user/me': () =>
        new Promise<Response>((resolve) => {
          release = resolve
        }),
    })

    renderRoutes('/sign-in')

    expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument()
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()

    release(envelope('unauthenticated', 401))

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument()
  })
})
