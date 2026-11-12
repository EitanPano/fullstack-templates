import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearSessionHint, hasSessionHint, setSessionHint } from '@/core/auth/session-hint'
import { AppAccountMenu } from '@/layout/app-account-menu/app-account-menu'
import { userApi } from '@/services/user.api'
import { createStore } from '@/store'
import { USER, envelope } from '@/testing/auth-fixtures'
import { renderInRouter } from '@/testing/render-in-router'
import { stubApi } from '@/testing/stub-api'

vi.mock('@/shared/components/toaster/toaster', () => ({ showWarningToast: vi.fn() }))
const { showWarningToast } = await import('@/shared/components/toaster/toaster')

beforeEach(() => {
  vi.mocked(showWarningToast).mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  clearSessionHint()
})

describe('AccountMenu', () => {
  it('keeps the trigger size while the account loads, with no role to announce', () => {
    stubApi({ 'GET /api/user/me': () => new Promise<Response>(() => undefined) })
    const { container } = renderInRouter(<AppAccountMenu />)

    expect(container.querySelector('.account-menu__skeleton')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows a visitor a sign-in link and the theme menu', async () => {
    stubApi({ 'GET /api/user/me': () => envelope('unauthenticated', 401) })
    renderInRouter(<AppAccountMenu />)

    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
    expect(screen.getByRole('button', { name: 'Account menu' })).toBeInTheDocument()
  })

  it('shows an account its menu with the email inside it, and no sign-in link', async () => {
    stubApi({ 'GET /api/user/me': Response.json(USER) })
    renderInRouter(<AppAccountMenu />)

    const trigger = await screen.findByRole('button', { name: 'Account menu, AD' })
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(screen.queryByText(USER.email)).not.toBeInTheDocument()

    await userEvent.click(trigger)

    expect(screen.getByText(USER.email)).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
  })

  describe('Sign out', () => {
    async function signedIn() {
      setSessionHint()
      const store = createStore()
      await store.dispatch(userApi.util.upsertQueryData('getMe', undefined, USER))
      renderInRouter(<AppAccountMenu />, { store })
      await userEvent.click(await screen.findByRole('button', { name: /^Account menu/ }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
      return store
    }

    it('revokes the session, forgets the account and goes to sign-in', async () => {
      const fetchMock = stubApi({ 'POST /api/auth/logout': new Response(null, { status: 204 }) })

      const store = await signedIn()

      await waitFor(() => {
        expect(screen.getByTestId('where')).toHaveTextContent('/sign-in')
      })
      expect((fetchMock.mock.calls[0]?.[0] as Request).url).toContain('/api/auth/logout')
      expect(userApi.endpoints.getMe.select()(store.getState()).data).toBeUndefined()
      expect(hasSessionHint()).toBe(false)
      expect(showWarningToast).not.toHaveBeenCalled()
    })

    it('signs out here even when the API refuses to revoke', async () => {
      stubApi({ 'POST /api/auth/logout': () => envelope('internal', 500) })

      const store = await signedIn()

      await waitFor(() => {
        expect(screen.getByTestId('where')).toHaveTextContent('/sign-in')
      })
      expect(userApi.endpoints.getMe.select()(store.getState()).data).toBeUndefined()
      expect(hasSessionHint()).toBe(false)
      expect(showWarningToast).toHaveBeenCalledWith(
        'Signed out here. The server could not be reached, so the session may still be open elsewhere.',
      )
    })
  })
})
