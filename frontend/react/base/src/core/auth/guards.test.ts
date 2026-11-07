import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  readSession,
  redirectIfSignedIn,
  requireAccount,
  requireRole,
  returnToOf,
} from '@/core/auth/guards'
import { createStore } from '@/store'
import { USER, envelope } from '@/testing/auth-fixtures'
import { stubApi } from '@/testing/stub-api'

const me = (user: object) => ({ 'GET /api/user/me': Response.json(user) })
const visitor = { 'GET /api/user/me': () => envelope('unauthenticated', 401) }

// A guard redirects by throwing React Router's redirect Response; the test reads where it points.
async function redirectOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise
  } catch (thrown) {
    if (thrown instanceof Response) return thrown.headers.get('location')
    throw thrown
  }
  return null
}

let log: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('readSession', () => {
  it('returns the account the API names', async () => {
    stubApi(me(USER))

    expect(await readSession(createStore())).toMatchObject({ email: USER.email })
  })

  it('returns null for a visitor, quietly', async () => {
    stubApi(visitor)

    expect(await readSession(createStore())).toBeNull()
    expect(log).not.toHaveBeenCalled()
  })

  it('fails closed when the API cannot answer, and logs why', async () => {
    stubApi({ 'GET /api/user/me': () => envelope('internal', 500) })

    expect(await readSession(createStore())).toBeNull()
    expect(log).toHaveBeenCalledWith('[session] could not read the account', expect.anything())
  })

  it('does not trust a body that is not an account', async () => {
    stubApi(me({ role: 'root' }))

    expect(await readSession(createStore())).toBeNull()
  })

  it('asks the API once for a burst of reads', async () => {
    const fetchMock = stubApi(me(USER))
    const store = createStore()

    await readSession(store)
    await readSession(store)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('returnToOf', () => {
  it('keeps the path and the query', () => {
    expect(returnToOf(new Request('http://localhost/profile?tab=1'))).toBe('/profile?tab=1')
  })
})

describe('requireAccount', () => {
  it('sends a visitor to sign-in with the way back', async () => {
    stubApi(visitor)

    expect(await redirectOf(requireAccount(createStore(), '/profile'))).toBe(
      '/sign-in?next=%2Fprofile',
    )
  })

  it('sends a visitor to plain sign-in when there is no way back', async () => {
    stubApi(visitor)

    expect(await redirectOf(requireAccount(createStore()))).toBe('/sign-in')
  })

  it('returns the account', async () => {
    stubApi(me(USER))

    expect(await requireAccount(createStore(), '/profile')).toMatchObject({ id: 'u1' })
  })
})

describe('requireRole', () => {
  it('sends another role to /forbidden', async () => {
    stubApi(me(USER))

    expect(await redirectOf(requireRole(createStore(), 'admin', '/admin'))).toBe('/forbidden')
  })

  it('returns an account with the role', async () => {
    stubApi(me({ ...USER, role: 'admin' }))

    expect(await requireRole(createStore(), 'admin')).toMatchObject({ role: 'admin' })
  })

  it('sends a visitor to sign-in', async () => {
    stubApi(visitor)

    expect(await redirectOf(requireRole(createStore(), 'admin', '/admin'))).toBe(
      '/sign-in?next=%2Fadmin',
    )
  })
})

describe('redirectIfSignedIn', () => {
  it('sends an account home', async () => {
    stubApi(me(USER))

    expect(await redirectOf(redirectIfSignedIn(createStore()))).toBe('/')
  })

  it('lets a visitor through', async () => {
    stubApi(visitor)

    expect(await redirectIfSignedIn(createStore())).toBeNull()
  })

  it('lets a visitor through when the API is down, and logs it', async () => {
    stubApi({ 'GET /api/user/me': () => envelope('internal', 500) })

    expect(await redirectIfSignedIn(createStore())).toBeNull()
    expect(log).toHaveBeenCalled()
  })
})
