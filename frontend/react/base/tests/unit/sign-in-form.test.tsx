import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SignInForm } from '@/feature/auth/ui/sign-in-form'
import { clearSessionHint, hasSessionHint } from '@/shared/api/session-hint'

import { SESSION, envelope, renderApp, stubApi } from './support'

// The toast library is a boundary; the API is a stubbed fetch behind the generated client, so the
// test goes through the real mutation, `call` and copy table and asserts what the person sees.
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const { toast } = await import('sonner')

async function fill(email: string, password: string) {
  if (email) await userEvent.type(screen.getByLabelText('Email'), email)
  if (password) await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('SignInForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearSessionHint()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('signs in, remembers the browser and goes to the page it came from', async () => {
    const fetchMock = stubApi({ 'POST /api/auth/login': Response.json(SESSION) })
    renderApp(<SignInForm next="/profile" />)

    await fill('a@b.co', 'correct horse')

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/profile'))
    const request = fetchMock.mock.calls[0]?.[0] as Request
    expect(await request.json()).toEqual({ email: 'a@b.co', password: 'correct horse' })
    expect(hasSessionHint()).toBe(true)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('goes home when no page was asked for, and ignores an unsafe next', async () => {
    stubApi({ 'POST /api/auth/login': Response.json(SESSION) })
    renderApp(<SignInForm next="//evil.example" />, { route: '/sign-in' })

    await fill('a@b.co', 'correct horse')

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/))
  })

  it('shows field errors on their fields and sends nothing', async () => {
    const fetchMock = stubApi({})
    renderApp(<SignInForm />)

    await fill('not-an-email', 'short')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Enter a valid email address')).toHaveAttribute('role', 'alert')
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Use at least 8 characters')).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('reports a wrong password with our copy in a toast, never the server text', async () => {
    stubApi({ 'POST /api/auth/login': envelope('unauthenticated', 401) })
    renderApp(<SignInForm />)

    await fill('a@b.co', 'correct horse')

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Email or password is wrong.')
    })
    expect(JSON.stringify(vi.mocked(toast.error).mock.calls)).not.toContain('hunter2')
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid')
    expect(screen.getByTestId('where')).toHaveTextContent('/')
    expect(hasSessionHint()).toBe(false)
  })

  it('reports the rate limit', async () => {
    stubApi({ 'POST /api/auth/login': envelope('rate_limited', 429) })
    renderApp(<SignInForm />)

    await fill('a@b.co', 'correct horse')

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Too many sign-in attempts. Wait a few minutes and try again.',
      )
    })
  })

  it('reports an unreachable API instead of crashing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('fetch failed')))
    renderApp(<SignInForm />)

    await fill('a@b.co', 'correct horse')

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Can't reach the server. Check your connection and try again.",
      )
    })
  })

  it('labels the button while the request is pending', async () => {
    vi.stubGlobal('fetch', () => new Promise(() => undefined))
    renderApp(<SignInForm />)

    await fill('a@b.co', 'correct horse')

    expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled()
  })

  it('links to sign-up', () => {
    renderApp(<SignInForm />)

    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/sign-up',
    )
  })
})
