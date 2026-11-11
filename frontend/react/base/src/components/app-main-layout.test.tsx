import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it } from 'vitest'

import { AppMainLayout } from '@/components/app-main-layout'

// Plain content: a page header renders a <header>, which the testing library can report as a
// banner even inside main, so the layout is asserted around a paragraph.
function setup() {
  const router = createMemoryRouter(
    [{ element: <AppMainLayout />, children: [{ path: '/', element: <p>Home body</p> }] }],
    { initialEntries: ['/'] },
  )
  render(<RouterProvider router={router} />)
}

describe('MainLayout', () => {
  it('renders the skip link first, then the one main with the page', () => {
    setup()

    const skip = screen.getByRole('link', { name: 'Skip to content' })
    const main = screen.getByRole('main')
    expect(skip).toHaveAttribute('href', '#main')
    expect(skip.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getAllByRole('link')[0]).toBe(skip)
    expect(main).toContainElement(screen.getByText('Home body'))
  })

  it('has exactly one main and no banner, navigation or contentinfo landmark', () => {
    setup()

    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
  })

  it('puts the skip link first in the tab order', async () => {
    setup()

    await userEvent.tab()

    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveFocus()
  })

  // jsdom does not follow a fragment link, so this asserts the link target and that main can take
  // focus; the e2e moves it for real.
  it('points the skip link at a focusable main', () => {
    setup()

    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1')
  })
})
