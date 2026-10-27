import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UserMenu } from '@/shared/ui/pattern/user-menu'

// The theme provider is a boundary: its hook is faked so the test asserts which theme is requested.
const setTheme = vi.fn()
let theme = 'light'
vi.mock('@/shared/ui/theme-provider', () => ({ useTheme: () => ({ theme, setTheme }) }))

describe('UserMenu with the theme toggle', () => {
  beforeEach(() => {
    setTheme.mockClear()
    theme = 'light'
  })

  it('offers Light, Dark and System and marks the active one', async () => {
    render(<UserMenu />)

    await userEvent.click(screen.getByRole('button', { name: /^Account menu/ }))

    expect(screen.getByRole('menuitemradio', { name: 'Light' })).toBeChecked()
    expect(screen.getByRole('menuitemradio', { name: 'Dark' })).not.toBeChecked()
    expect(screen.getByRole('menuitemradio', { name: 'System' })).not.toBeChecked()
  })

  it('switches the theme', async () => {
    render(<UserMenu />)

    await userEvent.click(screen.getByRole('button', { name: /^Account menu/ }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Dark' }))

    expect(setTheme).toHaveBeenCalledWith('dark')
  })

  it('shows the email as the first line of the menu, not in the header', async () => {
    render(<UserMenu email="ada@example.com" initials="AD" />)

    expect(screen.queryByText('ada@example.com')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Account menu/ }))

    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
  })

  it('puts the initials it shows into the button name (WCAG 2.5.3, axe label-content-name-mismatch)', () => {
    // aria-hidden does not satisfy the rule: the name itself must contain the visible text.
    render(<UserMenu email="ada@example.com" initials="AD" />)

    expect(screen.getByText('AD')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Account menu, AD' })).toBeInTheDocument()
  })

  it('is just the account menu without initials', () => {
    render(<UserMenu />)

    expect(screen.getByRole('button', { name: /^Account menu/ })).toHaveAccessibleName(
      'Account menu',
    )
  })

  it('renders the items slot above the theme choices', async () => {
    render(
      <UserMenu>
        <button type="button" role="menuitem">
          Sign out
        </button>
      </UserMenu>,
    )

    await userEvent.click(screen.getByRole('button', { name: /^Account menu/ }))

    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: 'Dark' })).toBeInTheDocument()
  })
})
