import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearSessionHint, hasSessionHint, setSessionHint } from '@/core/auth/session-hint'
import { SignOutButton } from '@/pages/user/components/sign-out-button'
import { userApi } from '@/services/user.api'
import { createStore } from '@/store'
import { USER, envelope } from '@/testing/auth-fixtures'
import { renderInRouter } from '@/testing/render-in-router'
import { stubApi } from '@/testing/stub-api'

vi.mock('sonner', () => ({ toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn() } }))
const { toast } = await import('sonner')

beforeEach(() => {
  vi.mocked(toast.warning).mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  clearSessionHint()
})

// The same action as the account menu's item, from the profile page: revoke, forget, sign-in.
async function signOut() {
  setSessionHint()
  const store = createStore()
  await store.dispatch(userApi.util.upsertQueryData('getMe', undefined, USER))
  renderInRouter(<SignOutButton />, { store })
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  return store
}

describe('SignOutButton', () => {
  it('revokes the session, forgets the account and goes to sign-in', async () => {
    const fetchMock = stubApi({ 'POST /api/auth/logout': new Response(null, { status: 204 }) })

    const store = await signOut()

    await waitFor(() => {
      expect(screen.getByTestId('where')).toHaveTextContent('/sign-in')
    })
    expect((fetchMock.mock.calls[0]?.[0] as Request).url).toContain('/api/auth/logout')
    expect(userApi.endpoints.getMe.select()(store.getState()).data).toBeUndefined()
    expect(hasSessionHint()).toBe(false)
    expect(toast.warning).not.toHaveBeenCalled()
  })

  it('signs out here and says so when the API refuses to revoke', async () => {
    stubApi({ 'POST /api/auth/logout': () => envelope('internal', 500) })

    const store = await signOut()

    await waitFor(() => {
      expect(screen.getByTestId('where')).toHaveTextContent('/sign-in')
    })
    expect(userApi.endpoints.getMe.select()(store.getState()).data).toBeUndefined()
    expect(hasSessionHint()).toBe(false)
    expect(toast.warning).toHaveBeenCalledWith(
      'Signed out here. The server could not be reached, so the session may still be open elsewhere.',
    )
  })
})
