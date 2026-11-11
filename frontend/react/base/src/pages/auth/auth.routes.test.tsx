import { screen, waitFor } from '@testing-library/react'
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

describe('the auth routes', () => {
  it('renders the sign-in screen for a visitor, without the shell', async () => {
    stubApi({ 'GET /api/user/me': () => envelope('unauthenticated', 401) })

    renderRoutes({ initialEntries: ['/sign-in'] })

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Skip to content' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('main')).toHaveLength(1)
  })

  it('renders the sign-up screen for a visitor', async () => {
    stubApi({ 'GET /api/user/me': () => envelope('unauthenticated', 401) })

    renderRoutes({ initialEntries: ['/sign-up'] })

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Create your account' }),
    ).toBeInTheDocument()
  })

  it.each(['/sign-in', '/sign-up'])('keeps a signed-in account out of %s', async (path) => {
    stubApi({ 'GET /api/user/me': Response.json(USER) })

    const { router } = renderRoutes({ initialEntries: [path] })

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/')
    })
  })

  it('shows the auth skeleton, without the shell, while the first loader runs', async () => {
    let release: (response: Response) => void = () => undefined
    stubApi({
      'GET /api/user/me': () =>
        new Promise<Response>((resolve) => {
          release = resolve
        }),
    })

    renderRoutes({ initialEntries: ['/sign-in'] })

    expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Skip to content' })).not.toBeInTheDocument()

    release(envelope('unauthenticated', 401))

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument()
  })
})
