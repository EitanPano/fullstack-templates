import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProfileCard } from '@/widget/profile/ui/profile-card'

// The guard is the session module's: here it is a boundary that either returns the account or
// throws the redirect, which is what `requireAccount` does for a visitor.
const requireAccount = vi.fn()
vi.mock('@/shared/auth/session', () => ({
  requireAccount: (returnTo?: string) => requireAccount(returnTo) as unknown,
}))

const user = { id: 'u1', email: 'ada@example.com', role: 'user' }

beforeEach(() => {
  requireAccount.mockReset()
})

describe('the profile card (the guarded example)', () => {
  it('shows the account behind the session', async () => {
    requireAccount.mockResolvedValue({ user, accessToken: 't' })

    render(await ProfileCard())

    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
    expect(screen.getByText('user')).toBeInTheDocument()
  })

  it('asks for an account and names its own path, so sign-in brings the visitor back', async () => {
    requireAccount.mockResolvedValue({ user, accessToken: 't' })

    await ProfileCard()

    expect(requireAccount).toHaveBeenCalledWith('/profile')
  })

  it('shows nothing for a visitor: the guard redirects before any markup', async () => {
    requireAccount.mockRejectedValue(new Error('NEXT_REDIRECT'))

    await expect(ProfileCard()).rejects.toThrow('NEXT_REDIRECT')
  })
})
