import { afterEach, describe, expect, it, vi } from 'vitest'

import { currentUserQuery } from '@/entity/user/api/user'
import {
  FORBIDDEN_PATH,
  SIGN_IN_PATH,
  readSession,
  redirectIfSignedIn,
  requireAccount,
  requireRole,
  returnToOf,
} from '@/shared/auth/session'

import { USER, createTestClient, envelope, stubApi } from './support'

// The session helpers are the SPA's data access layer: the API is a stubbed fetch, and a guard
// throws React Router's redirect (a Response), which the test reads.
const me = (user: object) => ({ 'GET /api/user/me': Response.json(user) })
const visitor = { 'GET /api/user/me': envelope('unauthenticated', 401) }

async function redirectOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise
  } catch (thrown) {
    if (thrown instanceof Response) return thrown.headers.get('location')
    throw thrown
  }
  return null
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('readSession', () => {
  it('returns the account the API names', async () => {
    stubApi(me(USER))

    expect(await readSession(createTestClient())).toMatchObject({ email: USER.email })
  })

  it('returns null for a visitor, quietly', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    stubApi(visitor)

    expect(await readSession(createTestClient())).toBeNull()
    expect(log).not.toHaveBeenCalled()
  })

  it('fails closed when the API cannot answer, and logs why', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    stubApi({ 'GET /api/user/me': envelope('internal', 500) })

    expect(await readSession(createTestClient())).toBeNull()
    expect(log).toHaveBeenCalled()
  })

  it('does not trust a body that is not an account', async () => {
    stubApi(me({ role: 'root' }))

    expect(await readSession(createTestClient())).toBeNull()
  })

  it('asks the API once for a burst of reads', async () => {
    const fetchMock = stubApi(me(USER))
    const client = createTestClient()
    // The helper's own stale time (30 s) applies, not the test client's zero.
    await readSession(client)
    await readSession(client)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('readSession next to the account menu read', () => {
  it('joins a read that is already in flight without logging a visitor as a failure', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    stubApi({
      'GET /api/user/me': () =>
        new Promise<Response>((resolve) =>
          setTimeout(() => {
            resolve(envelope('unauthenticated', 401))
          }, 10),
        ),
    })
    const client = createTestClient()

    const widgetRead = client.query(currentUserQuery()).catch(() => undefined)
    const session = await readSession(client)
    await widgetRead

    expect(session).toBeNull()
    expect(log).not.toHaveBeenCalled()
  })
})

describe('requireAccount', () => {
  it('returns the account', async () => {
    stubApi(me(USER))

    await expect(requireAccount(createTestClient())).resolves.toMatchObject({ id: 'u1' })
  })

  it('sends a visitor to sign-in, remembering where they were going', async () => {
    stubApi(visitor)

    expect(await redirectOf(requireAccount(createTestClient(), '/profile?tab=1'))).toBe(
      `${SIGN_IN_PATH}?next=${encodeURIComponent('/profile?tab=1')}`,
    )
    expect(await redirectOf(requireAccount(createTestClient()))).toBe(SIGN_IN_PATH)
  })
})

describe('requireRole', () => {
  it('lets the role through', async () => {
    stubApi(me({ ...USER, role: 'admin' }))

    await expect(requireRole(createTestClient(), 'admin')).resolves.toMatchObject({ role: 'admin' })
  })

  it('sends another role to the forbidden page', async () => {
    stubApi(me(USER))

    expect(await redirectOf(requireRole(createTestClient(), 'admin', '/staff'))).toBe(
      FORBIDDEN_PATH,
    )
  })

  it('sends a visitor to sign-in with the page to come back to', async () => {
    stubApi(visitor)

    expect(await redirectOf(requireRole(createTestClient(), 'admin', '/staff'))).toBe(
      `${SIGN_IN_PATH}?next=%2Fstaff`,
    )
  })
})

describe('redirectIfSignedIn', () => {
  it('sends an account home and lets a visitor through', async () => {
    stubApi(me(USER))
    expect(await redirectOf(redirectIfSignedIn(createTestClient()))).toBe('/')

    stubApi(visitor)
    await expect(redirectIfSignedIn(createTestClient())).resolves.toBeNull()
  })
})

describe('returnToOf', () => {
  it('is the path and query of the request', () => {
    expect(returnToOf(new Request('http://localhost/profile?tab=1#x'))).toBe('/profile?tab=1')
  })
})
