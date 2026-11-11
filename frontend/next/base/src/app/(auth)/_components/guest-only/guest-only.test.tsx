import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GuestOnly } from './guest-only'

// The session read and the router are boundaries; the redirect throws a marker so the test sees
// where a signed-in account is sent.
const readSession = vi.fn()
vi.mock('@/core/auth/session', () => ({
  readSession: () => readSession() as unknown,
  // The account of the faked session, as getCurrentUser reads it.
  getCurrentUser: async () => ((await readSession()) as { user: unknown } | null)?.user ?? null,
}))
class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`)
  }
}
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Redirected(to)
  },
}))

const user = { id: 'u1', email: 'a@b.co', role: 'user' }

beforeEach(() => {
  readSession.mockReset()
})

describe('GuestOnly (the (auth) layout gate)', () => {
  it('renders its children for a visitor', async () => {
    readSession.mockResolvedValue(null)

    render(await GuestOnly({ children: <p>the form</p> }))

    expect(screen.getByText('the form')).toBeInTheDocument()
  })

  it('sends a signed-in account to the home page', async () => {
    readSession.mockResolvedValue({ user, accessToken: 't' })

    await expect(GuestOnly({ children: <p>the form</p> })).rejects.toMatchObject({ to: '/' })
  })
})
