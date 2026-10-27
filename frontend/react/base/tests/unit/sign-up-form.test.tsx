import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SignUpForm } from '@/feature/auth/ui/sign-up-form'
import { clearSessionHint, hasSessionHint } from '@/shared/api/session-hint'

import { SESSION, envelope, renderApp, stubApi } from './support'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const { toast } = await import('sonner')

async function fill(email: string, password: string, confirm = password) {
  await userEvent.type(screen.getByLabelText('Email'), email)
  await userEvent.type(screen.getByLabelText('Password', { exact: true }), password)
  await userEvent.type(screen.getByLabelText('Confirm password'), confirm)
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
}

describe('SignUpForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearSessionHint()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('registers without the confirmation field, remembers the browser and goes home', async () => {
    const fetchMock = stubApi({
      'POST /api/auth/register': Response.json(SESSION, { status: 201 }),
    })
    renderApp(<SignUpForm />, { route: '/sign-up' })

    await fill('a@b.co', 'correct horse')

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/))
    expect(await (fetchMock.mock.calls[0]?.[0] as Request).json()).toEqual({
      email: 'a@b.co',
      password: 'correct horse',
    })
    expect(hasSessionHint()).toBe(true)
  })

  it('shows a taken email on the email field and not as a toast', async () => {
    stubApi({ 'POST /api/auth/register': envelope('conflict', 409) })
    renderApp(<SignUpForm />, { route: '/sign-up' })

    await fill('a@b.co', 'correct horse')

    const message = await screen.findByText('That email is already registered. Sign in instead.')
    expect(message).toHaveAttribute('role', 'alert')
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(toast.error).not.toHaveBeenCalled()
    expect(hasSessionHint()).toBe(false)
  })

  it('reports the rate limit in a toast', async () => {
    stubApi({ 'POST /api/auth/register': envelope('rate_limited', 429) })
    renderApp(<SignUpForm />, { route: '/sign-up' })

    await fill('a@b.co', 'correct horse')

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Too many sign-up attempts. Wait a few minutes and try again.',
      )
    })
  })

  it('refuses a confirmation that differs, on the confirmation field', async () => {
    const fetchMock = stubApi({})
    renderApp(<SignUpForm />, { route: '/sign-up' })

    await fill('a@b.co', 'correct horse', 'another horse')

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute('aria-invalid', 'true')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('labels the button while the request is pending', async () => {
    vi.stubGlobal('fetch', () => new Promise(() => undefined))
    renderApp(<SignUpForm />, { route: '/sign-up' })

    await fill('a@b.co', 'correct horse')

    expect(await screen.findByRole('button', { name: 'Creating account…' })).toBeDisabled()
  })

  it('links to sign-in', () => {
    renderApp(<SignUpForm />)

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
  })
})
