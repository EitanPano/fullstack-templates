import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SignInForm } from '@/feature/auth/ui/sign-in-form'

// The action and the toast library are boundaries: the action is a fake that answers like
// next-safe-action does, so the test asserts what the person sees.
vi.mock('@/feature/auth/server/action', () => ({ signIn: vi.fn(), signUp: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { signIn } = await import('@/feature/auth/server/action')
const { toast } = await import('sonner')

async function fill(email: string, password: string) {
  if (email) await userEvent.type(screen.getByLabelText('Email'), email)
  if (password) await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('SignInForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits the credentials and the page to come back to', async () => {
    vi.mocked(signIn).mockResolvedValue({})
    render(<SignInForm next="/profile" />)

    await fill('a@b.co', 'correct horse')

    expect(signIn).toHaveBeenCalledTimes(1)
    expect(vi.mocked(signIn).mock.calls[0]?.[0]).toEqual({
      email: 'a@b.co',
      password: 'correct horse',
      next: '/profile',
    })
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('shows field errors on their fields and does not call the action', async () => {
    render(<SignInForm />)

    await fill('not-an-email', 'short')

    expect(signIn).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Enter a valid email address')).toHaveAttribute('role', 'alert')
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Use at least 8 characters')).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('reports a refused sign-in (wrong password) with a toast, leaving the fields unmarked', async () => {
    vi.mocked(signIn).mockResolvedValue({ serverError: 'Email or password is wrong.' })
    render(<SignInForm />)

    await fill('a@b.co', 'correct horse')

    expect(toast.error).toHaveBeenCalledWith('Email or password is wrong.')
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid')
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('aria-invalid')
  })

  it('puts an error the server returned for a field on that field, and not in a toast', async () => {
    vi.mocked(signIn).mockResolvedValue({
      validationErrors: { email: { _errors: ['Check this field.'] } },
    })
    render(<SignInForm />)

    await fill('a@b.co', 'correct horse')

    expect(await screen.findByText('Check this field.')).toHaveAttribute('role', 'alert')
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('links to sign-up', () => {
    render(<SignInForm />)

    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/sign-up',
    )
  })
})
