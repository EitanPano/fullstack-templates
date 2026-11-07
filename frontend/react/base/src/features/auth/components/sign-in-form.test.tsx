import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearSessionHint, hasSessionHint } from '@/core/auth/session-hint'
import { SignInForm } from '@/features/auth/components/sign-in-form'
import { SESSION, envelope } from '@/testing/auth-fixtures'
import { renderInRouter } from '@/testing/render-in-router'
import { stubApi } from '@/testing/stub-api'

// The toast library is a boundary; the API is a stubbed fetch behind the generated client, so the
// test goes through the real mutation, `call` and copy table and asserts what the person sees.
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const { toast } = await import('sonner')

async function fill(email: string, password: string) {
  if (email) await userEvent.type(screen.getByLabelText('Email'), email)
  if (password) await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  clearSessionHint()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('SignInForm', () => {
  it('signs in, remembers the browser and goes to the page it came from', async () => {
    const fetchMock = stubApi({ 'POST /api/auth/login': Response.json(SESSION) })
    renderInRouter(<SignInForm next="/profile" />, { route: '/sign-in' })

    await fill('a@b.co', 'correct horse')

    await waitFor(() => {
      expect(screen.getByTestId('where')).toHaveTextContent('/profile')
    })
    const request = fetchMock.mock.calls[0]?.[0] as Request
    expect(await request.json()).toEqual({ email: 'a@b.co', password: 'correct horse' })
    expect(hasSessionHint()).toBe(true)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('goes home when no page was asked for, and ignores an unsafe next', async () => {
    stubApi({ 'POST /api/auth/login': Response.json(SESSION) })
    renderInRouter(<SignInForm next="//evil.example" />, { route: '/sign-in' })

    await fill('a@b.co', 'correct horse')

    await waitFor(() => {
      expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/)
    })
  })

  it('shows field errors on their fields and sends nothing', async () => {
    const fetchMock = stubApi({})
    renderInRouter(<SignInForm />)

    await fill('not-an-email', 'short')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Enter a valid email address')).toHaveAttribute('role', 'alert')
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Use at least 8 characters')).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('reports a wrong password with our copy in a toast, never the server text', async () => {
    stubApi({ 'POST /api/auth/login': () => envelope('unauthenticated', 401) })
    renderInRouter(<SignInForm />, { route: '/sign-in' })

    await fill('a@b.co', 'correct horse')

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Email or password is wrong.')
    })
    expect(JSON.stringify(vi.mocked(toast.error).mock.calls)).not.toContain('server text')
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid')
    expect(screen.getByTestId('where')).toHaveTextContent('/sign-in')
    expect(hasSessionHint()).toBe(false)
  })

  it('reports the rate limit', async () => {
    stubApi({ 'POST /api/auth/login': () => envelope('rate_limited', 429) })
    renderInRouter(<SignInForm />)

    await fill('a@b.co', 'correct horse')

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Too many sign-in attempts. Wait a few minutes and try again.',
      )
    })
  })

  it('reports an unreachable API instead of crashing', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('fetch failed')))
    renderInRouter(<SignInForm />)

    await fill('a@b.co', 'correct horse')

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Can't reach the server. Check your connection and try again.",
      )
    })
  })

  it('labels the button while the request is pending', async () => {
    vi.stubGlobal('fetch', () => new Promise(() => undefined))
    renderInRouter(<SignInForm />)

    await fill('a@b.co', 'correct horse')

    expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled()
  })

  it('links to sign-up', () => {
    renderInRouter(<SignInForm />)

    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/sign-up',
    )
  })
})
