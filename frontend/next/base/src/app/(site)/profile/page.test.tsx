import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Profile, { metadata } from '@/app/(site)/profile/page'

// The widget is async and guarded; its own test covers it. Rendering it here would print React's
// "async Client Component" warning (jsdom has no server components), and the page only places it.
vi.mock('./_components/profile-card', () => ({
  ProfileCard: () => <p>the profile card</p>,
}))
vi.mock('@/actions/auth', () => ({
  signOut: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
}))

const { signOut } = await import('@/actions/auth')

describe('the profile page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('has a title and its one h1, and places the card', () => {
    render(<Profile />)

    expect(metadata.title).toBe('Profile')
    expect(screen.getByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument()
    expect(screen.getByText('the profile card')).toBeInTheDocument()
  })

  it('runs the sign-out action from its Sign out button', async () => {
    vi.mocked(signOut).mockResolvedValue({})
    render(<Profile />)

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('signs nobody out until the button is pressed', () => {
    render(<Profile />)

    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(signOut).not.toHaveBeenCalled()
  })
})
