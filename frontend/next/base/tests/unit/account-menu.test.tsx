import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { initials } from '@/entity/user/model'
import { AccountMenu } from '@/widget/account-menu/ui/account-menu'

// The session read, the sign-out action and next-themes are boundaries.
const readSession = vi.fn()
vi.mock('@/shared/auth/session', () => ({ readSession: () => readSession() as unknown }))
vi.mock('@/feature/auth/server/action', () => ({
  signOut: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
}))
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }))

const { signOut } = await import('@/feature/auth/server/action')

const user = { id: 'u1', email: 'ada.lovelace@example.com', role: 'user' }

describe('AccountMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the avatar with initials, and the email, theme and sign-out inside the menu', async () => {
    readSession.mockResolvedValue({ user, accessToken: 't' })
    render(await AccountMenu())

    const trigger = screen.getByRole('button', { name: /^Account menu/ })
    expect(trigger).toHaveTextContent('AD')
    // The email is never header text beside a primary button.
    expect(screen.queryByText('ada.lovelace@example.com')).not.toBeInTheDocument()

    await userEvent.click(trigger)

    expect(screen.getByText('ada.lovelace@example.com')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: 'Dark' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('runs the sign-out action from the menu item', async () => {
    readSession.mockResolvedValue({ user, accessToken: 't' })
    vi.mocked(signOut).mockResolvedValue({})
    render(await AccountMenu())

    await userEvent.click(screen.getByRole('button', { name: /^Account menu/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))

    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('offers sign-in and only the theme menu when nobody is signed in', async () => {
    readSession.mockResolvedValue(null)
    render(await AccountMenu())

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
    await userEvent.click(screen.getByRole('button', { name: /^Account menu/ }))

    expect(screen.getByRole('menuitemradio', { name: 'Dark' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Sign out' })).not.toBeInTheDocument()
  })
})

describe('initials', () => {
  it('takes the first two letters of the part before the @', () => {
    expect(initials({ email: 'ada.lovelace@example.com' })).toBe('AD')
    expect(initials({ email: 'x@example.com' })).toBe('X')
  })

  it('has no initials for something that is not an email', () => {
    expect(initials({ email: '' })).toBeUndefined()
    expect(initials({ email: '@example.com' })).toBeUndefined()
  })
})
