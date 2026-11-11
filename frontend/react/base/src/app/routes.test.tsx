import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AppMainError } from '@/layout/app-main-error'
import { AppMainLayout } from '@/layout/app-main-layout/app-main-layout'
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

  // @server-start
  // A loader that fails once, then answers: the group boundary shows the ApiError's own copy, never
  // the server's text, and Try again revalidates the loaders.
  // @server-end
  // @noserver-start
  // A loader that fails once, then answers: the group boundary shows its generic line, never the
  // error's text, and Try again revalidates the loaders.
  // @noserver-end
  describe('the group error boundary', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    function setupFailingOnce() {
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      let recovered = false
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
                      if (recovered) return null
                      throw Object.assign(new Error('db down: hunter2'), {
                        code: 'upstream_unavailable',
                        message: 'The service is unavailable right now. Try again in a moment.',
                      })
                    },
                    element: <p>Back</p>,
                  },
                ],
              },
            ],
          },
        ],
        { initialEntries: ['/'] },
      )
      const view = render(<RouterProvider router={router} />)
      return { view, recover: () => (recovered = true) }
    }

    it('renders inside main, in the page container, with the safe copy only', async () => {
      const { view } = setupFailingOnce()

      expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable right now/i) // @server
      expect(await screen.findByRole('alert')).toHaveTextContent(/Something went wrong\. Try again\./) // @noserver
      expect(view.container.querySelector('main > .page')).not.toBeNull()
      expect(document.body).not.toHaveTextContent('hunter2')
    })

    it('renders the page once Try again finds the loader answering', async () => {
      const { recover } = setupFailingOnce()
      await screen.findByRole('alert')

      recover()
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

      expect(await screen.findByText('Back')).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})
