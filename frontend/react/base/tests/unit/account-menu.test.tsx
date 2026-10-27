import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { initials } from '@/entity/user/model'
import { AccountMenu } from '@/widget/account-menu/ui/account-menu'

import { USER, envelope, renderApp, stubApi } from './support'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AccountMenu', () => {
  it('shows a visitor a sign-in link and the theme menu', async () => {
    stubApi({ 'GET /api/user/me': envelope('unauthenticated', 401) })
    renderApp(<AccountMenu />)

    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
    expect(screen.getByRole('button', { name: 'Account menu' })).toBeInTheDocument()
  })

  it('shows an account its menu with the email inside it, and no sign-in link', async () => {
    stubApi({ 'GET /api/user/me': Response.json(USER) })
    renderApp(<AccountMenu />)

    const trigger = await screen.findByRole('button', { name: 'Account menu, AD' })
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(screen.queryByText(USER.email)).not.toBeInTheDocument()

    await userEvent.click(trigger)

    expect(screen.getByText(USER.email)).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('keeps the trigger size while the account loads, with no role to announce', () => {
    stubApi({ 'GET /api/user/me': () => new Promise<Response>(() => undefined) })
    const { container } = renderApp(<AccountMenu />)

    expect(container.querySelector('[data-slot="skeleton"]')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('takes two letters of the name for the avatar', () => {
    expect(initials({ email: 'ada.lovelace@example.com' })).toBe('AD')
    expect(initials({ email: '--@example.com' })).toBeUndefined()
  })
})
