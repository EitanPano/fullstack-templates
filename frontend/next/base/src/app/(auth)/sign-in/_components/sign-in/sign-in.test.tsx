import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SignIn } from './sign-in'

vi.mock('@/actions/auth/auth', () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
}))

describe('the sign-in screen', () => {
  it('renders its card with the form', async () => {
    render(await SignIn({ searchParams: Promise.resolve({}) }))

    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('hands the form only a path on this site as the page to return to', async () => {
    render(await SignIn({ searchParams: Promise.resolve({ next: 'https://evil.example' }) }))

    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/sign-up',
    )
  })
})
