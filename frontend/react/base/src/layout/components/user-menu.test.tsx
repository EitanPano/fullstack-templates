import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { describe, expect, it } from 'vitest'

import { UserMenu } from '@/layout/components/user-menu'
import { DropdownMenuItem } from '@/shared/components/dropdown-menu'
import { createStore } from '@/store'

function setup(props: Parameters<typeof UserMenu>[0] = {}) {
  render(
    <Provider store={createStore()}>
      <UserMenu {...props} />
    </Provider>,
  )
}

describe('UserMenu', () => {
  it('is named Account menu and opens to the three theme choices', async () => {
    setup()

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))

    expect(await screen.findAllByRole('menuitemradio')).toHaveLength(3)
  })

  it('appends the initials to the accessible name', () => {
    setup({ initials: 'AB' })

    expect(screen.getByRole('button', { name: 'Account menu, AB' })).toBeInTheDocument()
  })

  it('shows the email inside the menu, not in the header trigger', async () => {
    setup({ email: 'ab@example.com' })
    expect(screen.queryByText('ab@example.com')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))

    expect(await screen.findByText('ab@example.com')).toBeInTheDocument()
  })

  it('renders the items slot above the theme choices', async () => {
    setup({
      children: <DropdownMenuItem>Sign out</DropdownMenuItem>,
    })
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))

    expect(await screen.findByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('has no separator without an email or items', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await screen.findByRole('menu')

    expect(screen.queryAllByRole('separator')).toHaveLength(0)
  })
})
