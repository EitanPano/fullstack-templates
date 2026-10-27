import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import Profile, { metadata } from '@/app/(site)/profile/page'

// The widget is async and guarded; its own test covers it. Rendering it here would print React's
// "async Client Component" warning (jsdom has no server components), and the page only places it.
vi.mock('@/widget/profile/ui/profile-card', () => ({
  ProfileCard: () => <p>the profile card</p>,
}))

describe('the profile page', () => {
  it('has a title and its one h1, and places the card', () => {
    render(<Profile />)

    expect(metadata.title).toBe('Profile')
    expect(screen.getByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument()
    expect(screen.getByText('the profile card')).toBeInTheDocument()
  })
})
