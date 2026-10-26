import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Forbidden, { metadata } from '@/app/(site)/forbidden/page'
import { GuestOnly } from '@/widget/guest-only/ui/guest-only'
import { SignIn } from '@/widget/sign-in/ui/sign-in'
import { SignUp } from '@/widget/sign-up/ui/sign-up'

// The session read and the router are boundaries; the redirect throws a marker so the test sees
// where a signed-in account is sent.
const readSession = vi.fn()
vi.mock('@/shared/auth/session', () => ({ readSession: () => readSession() as unknown }))
vi.mock('@/feature/auth/server/action', () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
}))
class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`)
  }
}
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Redirected(to)
  },
}))

const user = { id: 'u1', email: 'a@b.co', role: 'user' }

beforeEach(() => {
  readSession.mockReset()
})

describe('GuestOnly (the (auth) layout gate)', () => {
  it('renders its children for a visitor', async () => {
    readSession.mockResolvedValue(null)

    render(await GuestOnly({ children: <p>the form</p> }))

    expect(screen.getByText('the form')).toBeInTheDocument()
  })

  it('sends a signed-in account to the home page', async () => {
    readSession.mockResolvedValue({ user, accessToken: 't' })

    await expect(GuestOnly({ children: <p>the form</p> })).rejects.toMatchObject({ to: '/' })
  })
})

describe('the sign-in and sign-up screens', () => {
  it('render their card with the form', async () => {
    render(await SignIn({ searchParams: Promise.resolve({}) }))

    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('sign-up renders its card', async () => {
    render(await SignUp({ searchParams: Promise.resolve({}) }))

    expect(
      screen.getByRole('heading', { level: 1, name: 'Create your account' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument()
  })

  it('hand the form only a path on this site as the page to return to', async () => {
    render(await SignIn({ searchParams: Promise.resolve({ next: 'https://evil.example' }) }))

    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/sign-up',
    )
  })
})

describe('the /forbidden page', () => {
  it('tells an account without the role that it has no access, with a way out', () => {
    render(<Forbidden />)

    expect(screen.getByRole('heading', { level: 1, name: 'Access denied' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the start' })).toHaveAttribute('href', '/')
  })

  it('is kept out of search indexes', () => {
    expect(metadata.robots).toMatchObject({ index: false })
  })
})
