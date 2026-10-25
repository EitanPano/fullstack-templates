import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { AppShell } from '@/shared/ui/app-shell'

const nav = [
  { to: '/', label: 'Home' },
  { to: '/plant', label: 'Plants' },
]

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <AppShell name="demo" nav={nav}>
            <p>content</p>
          </AppShell>
        ),
      },
    ],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />)
}

describe('AppShell', () => {
  it('renders the landmarks, the skip link and the nav entries', () => {
    renderAt('/')

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
    expect(screen.getByRole('contentinfo')).toHaveTextContent('demo')
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main')
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Plants' })).toBeInTheDocument()
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('marks only the current route as current', () => {
    renderAt('/plant')

    expect(screen.getByRole('link', { name: 'Plants' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  })

  it('marks exactly one link as current on the home route, not the brand too', () => {
    const { container } = renderAt('/')

    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
  })
})
