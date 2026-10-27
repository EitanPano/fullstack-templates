import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SignOutItem } from '@/feature/auth/ui/sign-out-item'
import { getApiUserMeQueryKey } from '@/shared/api/generated/@tanstack/react-query.gen'
import { clearSessionHint, hasSessionHint, setSessionHint } from '@/shared/api/session-hint'
import { UserMenu } from '@/shared/ui/pattern/user-menu'

import { USER, envelope, renderApp, stubApi } from './support'

afterEach(() => {
  vi.unstubAllGlobals()
  clearSessionHint()
})

async function signOut() {
  await userEvent.click(screen.getByRole('button', { name: /^Account menu/ }))
  await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
}

describe('SignOutItem', () => {
  it('revokes the session, forgets the account and goes to sign-in', async () => {
    setSessionHint()
    const fetchMock = stubApi({ 'POST /api/auth/logout': new Response(null, { status: 204 }) })
    const { client } = renderApp(
      <UserMenu email={USER.email} initials="AD">
        <SignOutItem />
      </UserMenu>,
    )
    client.setQueryData(getApiUserMeQueryKey(), USER)

    await signOut()

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/sign-in'))
    expect((fetchMock.mock.calls[0]?.[0] as Request).url).toContain('/api/auth/logout')
    expect(client.getQueryData(getApiUserMeQueryKey())).toBeUndefined()
    expect(hasSessionHint()).toBe(false)
  })

  it('signs out here even when the API refuses to revoke', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    setSessionHint()
    stubApi({ 'POST /api/auth/logout': envelope('internal', 500) })
    const { client } = renderApp(
      <UserMenu email={USER.email} initials="AD">
        <SignOutItem />
      </UserMenu>,
    )
    client.setQueryData(getApiUserMeQueryKey(), USER)

    await signOut()

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/sign-in'))
    expect(client.getQueryData(getApiUserMeQueryKey())).toBeUndefined()
    expect(hasSessionHint()).toBe(false)
  })
})
