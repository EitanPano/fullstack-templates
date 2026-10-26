import { afterEach, describe, expect, it, vi } from 'vitest'

// The session read is the boundary: the account and role clients are tested against fakes of it.
const readSession = vi.fn()
vi.mock('@/shared/auth/session', () => ({ readSession: () => readSession() as unknown }))

const { accountAction, roleAction } = await import('@/shared/lib/safe-action')

const session = (role: 'user' | 'admin') => ({
  user: { id: 'u1', email: 'a@b.co', role },
  accessToken: 'tok',
})

afterEach(() => {
  readSession.mockReset()
})

describe('accountAction', () => {
  it('fails closed with our copy when there is no session, and never runs the handler', async () => {
    readSession.mockResolvedValue(null)
    const handler = vi.fn()

    const result = await accountAction.action(handler)()

    expect(result.serverError).toBe('Sign in to continue.')
    expect(handler).not.toHaveBeenCalled()
  })

  it('puts the session in ctx', async () => {
    readSession.mockResolvedValue(session('user'))

    const result = await accountAction.action(({ ctx }) =>
      Promise.resolve(ctx.session.user.email),
    )()

    expect(result.data).toBe('a@b.co')
  })
})

describe('roleAction', () => {
  it('refuses an account with another role, without running the handler', async () => {
    readSession.mockResolvedValue(session('user'))
    const handler = vi.fn()

    const result = await roleAction('admin').action(handler)()

    expect(result.serverError).toBe("You don't have access to this.")
    expect(handler).not.toHaveBeenCalled()
  })

  it('runs the handler for the role', async () => {
    readSession.mockResolvedValue(session('admin'))

    const result = await roleAction('admin').action(() => Promise.resolve('done'))()

    expect(result.data).toBe('done')
  })

  it('refuses when there is no session at all', async () => {
    readSession.mockResolvedValue(null)

    const result = await roleAction('admin').action(() => Promise.resolve('done'))()

    expect(result.serverError).toBe('Sign in to continue.')
  })
})
