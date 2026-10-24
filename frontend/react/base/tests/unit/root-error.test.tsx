import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import RootError from '@/app/error'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('root error boundary', () => {
  it('shows a safe message and logs the cause', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const cause = new Error('internal detail at https://internal.example/secret')
    const router = createMemoryRouter(
      [
        {
          path: '/',
          loader: () => {
            throw cause
          },
          Component: () => null,
          ErrorBoundary: RootError,
        },
      ],
      { initialEntries: ['/'] },
    )

    render(<RouterProvider router={router} />)

    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent('internal')
    expect(log).toHaveBeenCalledWith('app: render failed', cause)
  })
})
