import { render, screen } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it, vi } from 'vitest'

import { AppMainError } from '@/components/app-main-error'
import { AppMainLayout } from '@/components/app-main-layout'
import { stubApi } from '@/testing/stub-api'
import { renderRoutes } from '@/testing/render-routes'

describe('the route table', () => {
  it('renders the home route as one h1 and one line of copy, with no data call', async () => {
    const fetchMock = stubApi({})

    renderRoutes()

    expect(
      await screen.findByRole('heading', { level: 1, name: '__PROJECT_DISPLAY_NAME__' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Replace this page with the first screen.')).toBeVisible()
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading', { level: 1 }))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('renders Page not found inside main, as the page container, for an unknown URL', async () => {
    stubApi({})

    const { container } = renderRoutes({ initialEntries: ['/no/such/page'] })

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toContainElement(screen.getByText('Page not found'))
    expect(container.querySelector('main > .page')).not.toBeNull()
  })

  it('renders the group error boundary inside main, as the page container', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const router = createMemoryRouter(
      [
        {
          element: <AppMainLayout />,
          children: [
            {
              ErrorBoundary: AppMainError,
              children: [
                {
                  path: '/',
                  loader: () => {
                    throw new Error('boom')
                  },
                  element: <p>never</p>,
                },
              ],
            },
          ],
        },
      ],
      { initialEntries: ['/'] },
    )
    const { container } = render(<RouterProvider router={router} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i)
    expect(container.querySelector('main > .page')).not.toBeNull()
    vi.restoreAllMocks()
  })
})
