import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RequireRole } from '@/shared/auth/require-role'

import { USER, envelope, renderApp, stubApi } from './support'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RequireRole', () => {
  it('shows its children to the role', async () => {
    stubApi({ 'GET /api/user/me': Response.json({ ...USER, role: 'admin' }) })
    renderApp(<RequireRole role="admin">staff controls</RequireRole>)

    expect(await screen.findByText('staff controls')).toBeInTheDocument()
  })

  it('hides them from another role and shows the fallback', async () => {
    stubApi({ 'GET /api/user/me': Response.json(USER) })
    renderApp(
      <RequireRole role="admin" fallback={<p>no access</p>}>
        staff controls
      </RequireRole>,
    )

    expect(await screen.findByText('no access')).toBeInTheDocument()
    expect(screen.queryByText('staff controls')).not.toBeInTheDocument()
  })

  it('hides them from a visitor', async () => {
    stubApi({ 'GET /api/user/me': envelope('unauthenticated', 401) })
    renderApp(<RequireRole role="admin">staff controls</RequireRole>)

    await vi.waitFor(() => {
      expect(screen.queryByText('staff controls')).not.toBeInTheDocument()
    })
  })
})
