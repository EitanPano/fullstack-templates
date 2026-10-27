import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { AppShell } from '@/shared/ui/pattern/app-shell'

import { renderApp } from './support'

const nav = [
  { to: '/', label: 'Home' },
  { to: '/plant', label: 'Plants' },
]

function renderShell(path = '/') {
  return renderApp(
    <AppShell name="Demo" nav={nav} account={<button type="button">Account slot</button>}>
      <p>content</p>
    </AppShell>,
    { route: path },
  )
}

describe('AppShell', () => {
  it('renders the landmarks, the skip link and the page content', () => {
    renderShell()

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Demo')
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main')
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('has exactly one main landmark and links the brand to the start', () => {
    renderShell()

    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Demo' })).toHaveAttribute('href', '/')
  })

  it('renders the account slot in the header', () => {
    renderShell()

    const header = screen.getByRole('banner')
    expect(within(header).getByRole('button', { name: 'Account slot' })).toBeInTheDocument()
  })

  it('lists every nav entry and marks only the current one', () => {
    renderShell()

    const inline = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(inline).getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(inline).getByRole('link', { name: 'Plants' })).not.toHaveAttribute('aria-current')
  })

  it('does not mark /plant as current on a sibling path that only shares the prefix', () => {
    renderShell('/plant-care')

    expect(screen.getByRole('link', { name: 'Plants' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  })

  it('marks /plant as current on a nested path', () => {
    renderShell('/plant/42')

    expect(screen.getByRole('link', { name: 'Plants' })).toHaveAttribute('aria-current', 'page')
  })

  it('opens the same entries in a sheet from the menu button (the phone navigation)', async () => {
    renderShell('/plant')

    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }))

    const sheet = await screen.findByRole('dialog', { name: 'Menu' })
    const links = within(sheet).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['Home', 'Plants'])
    expect(within(sheet).getByRole('link', { name: 'Plants' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('closes the sheet when an entry is chosen', async () => {
    renderShell()

    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    const sheet = await screen.findByRole('dialog', { name: 'Menu' })
    await userEvent.click(within(sheet).getByRole('link', { name: 'Plants' }))

    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument()
  })
})
