import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it } from 'vitest'

import { AppMainLayout } from '@/components/app-main-layout'
import type { NavEntry } from '@/models/nav'
import { createStore } from '@/store'
import { stubApi } from '@/testing/stub-api'

const NAV: NavEntry[] = [
  { to: '/', label: 'Home' },
  { to: '/plant', label: 'Plant' },
]

function setup() {
  // With auth the account slot reads the session; a visitor's 401 is the quietest answer. Without
  // auth nothing asks, and the stub is unused.
  stubApi({
    'GET /api/user/me': () =>
      Response.json({ error: { code: 'unauthenticated', message: 'x' } }, { status: 401 }),
  })
  const router = createMemoryRouter(
    [
      {
        element: <AppMainLayout nav={NAV} />,
        children: [
          { path: '/', element: <p>Home body</p> },
          { path: '/plant', element: <p>Plant body</p> },
        ],
      },
    ],
    { initialEntries: ['/'] },
  )
  render(
    <Provider store={createStore()}>
      <RouterProvider router={router} />
    </Provider>,
  )
}

describe('MainLayout', () => {
  it('has the banner, main and contentinfo landmarks', () => {
    setup()

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveTextContent('Home body')
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  it('puts the skip link first in the tab order', async () => {
    setup()

    await userEvent.tab()

    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveFocus()
  })

  it('renders the account slot inside the banner', async () => {
    setup()

    expect(
      await within(screen.getByRole('banner')).findByRole('button', { name: /^Account menu/ }),
    ).toBeInTheDocument()
  })

  // jsdom does not follow a fragment link, so this asserts the link target and that main can take
  // focus; the e2e moves it for real.
  it('points the skip link at a focusable main', () => {
    setup()

    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1')
  })

  it('lists the nav prop in the primary navigation and marks the current page', () => {
    setup()

    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Home', 'Plant'])
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Plant' })).not.toHaveAttribute('aria-current')
  })

  it('opens the same entries in a Menu dialog and closes it on navigate', async () => {
    setup()

    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }))

    const dialog = await screen.findByRole('dialog', { name: 'Menu' })
    const links = within(dialog).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['Home', 'Plant'])

    await userEvent.click(within(dialog).getByRole('link', { name: 'Plant' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByText('Plant body')).toBeInTheDocument()
  })
})
