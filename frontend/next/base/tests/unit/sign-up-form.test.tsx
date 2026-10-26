import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SignUpForm } from '@/feature/auth/ui/sign-up-form'

vi.mock('@/feature/auth/server/action', () => ({ signIn: vi.fn(), signUp: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { signUp } = await import('@/feature/auth/server/action')
const { toast } = await import('sonner')

async function fill(email: string, password: string, confirm: string) {
  await userEvent.type(screen.getByLabelText('Email'), email)
  await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.type(screen.getByLabelText('Confirm password'), confirm)
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
}

describe('SignUpForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits email, password and confirmation', async () => {
    vi.mocked(signUp).mockResolvedValue({})
    render(<SignUpForm />)

    await fill('a@b.co', 'correct horse', 'correct horse')

    expect(signUp).toHaveBeenCalledTimes(1)
    expect(vi.mocked(signUp).mock.calls[0]?.[0]).toMatchObject({
      email: 'a@b.co',
      password: 'correct horse',
      confirm: 'correct horse',
    })
  })

  it('shows a confirmation that differs on the confirmation field', async () => {
    render(<SignUpForm />)

    await fill('a@b.co', 'correct horse', 'something else')

    expect(signUp).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Passwords do not match')).toHaveAttribute('role', 'alert')
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('aria-invalid')
  })

  it('shows a taken email (409) on the email field, with no toast repeating it', async () => {
    vi.mocked(signUp).mockResolvedValue({
      validationErrors: {
        email: { _errors: ['That email is already registered. Sign in instead.'] },
      },
    })
    render(<SignUpForm />)

    await fill('a@b.co', 'correct horse', 'correct horse')

    expect(
      await screen.findByText('That email is already registered. Sign in instead.'),
    ).toHaveAttribute('role', 'alert')
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('reports the rate limit (429) with a toast', async () => {
    vi.mocked(signUp).mockResolvedValue({
      serverError: 'Too many sign-up attempts. Wait a few minutes and try again.',
    })
    render(<SignUpForm />)

    await fill('a@b.co', 'correct horse', 'correct horse')

    expect(toast.error).toHaveBeenCalledWith(
      'Too many sign-up attempts. Wait a few minutes and try again.',
    )
  })

  it('links to sign-in', () => {
    render(<SignUpForm />)

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
  })
})
