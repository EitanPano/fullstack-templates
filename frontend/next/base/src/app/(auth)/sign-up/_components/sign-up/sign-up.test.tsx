import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SignUp } from './sign-up'

vi.mock('@/actions/auth/auth', () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
}))

describe('the sign-up screen', () => {
  it('renders its card', async () => {
    render(await SignUp({ searchParams: Promise.resolve({}) }))

    expect(
      screen.getByRole('heading', { level: 1, name: 'Create your account' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument()
  })
})
