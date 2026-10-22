import { afterEach, beforeEach, describe, expect, setSystemTime, spyOn, test } from 'bun:test'
import { memory } from '../../src/infra/memory'
import type { SessionRecord } from '../../src/models/session/interface'
import { getDb } from '../../src/services/db'
import { AppError } from '../../src/services/utils/error'
import { decrypt, sha256 } from '../../src/services/security/crypto'
import {
  createSession,
  purgeExpired,
  revokeAllSessions,
  revokeSession,
  rotateSession,
} from '../../src/services/session'

const DAY = 86_400_000
const T0 = new Date('2026-01-01T00:00:00Z')

const sessions = () => getDb().collection<SessionRecord>('session')
async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(AppError)
    return error
  }
  return undefined
}
const at = (ms: number) => setSystemTime(new Date(T0.getTime() + ms))

beforeEach(async () => {
  await memory.close()
  setSystemTime(T0)
})
afterEach(() => setSystemTime())

describe('createSession', () => {
  test('stores the hash of the token, never the token', async () => {
    const { session, refreshToken } = await createSession('u1')
    const stored = await sessions().get(session.id)
    expect(stored?.tokenHash).toBe(sha256(refreshToken))
    expect(JSON.stringify(stored)).not.toContain(refreshToken)
    expect(stored?.expiresAt.getTime()).toBe(T0.getTime() + 30 * DAY)
    expect(stored?.absoluteExpiresAt.getTime()).toBe(T0.getTime() + 90 * DAY)
  })
})

describe('rotateSession', () => {
  test('rotates with the current hash', async () => {
    const first = await createSession('u1')
    at(1000)
    const next = await rotateSession({
      sessionId: first.session.id,
      presentedHash: sha256(first.refreshToken),
    })
    expect(next.refreshToken).not.toBe(first.refreshToken)
    expect(next.session.previousTokenHash).toBe(sha256(first.refreshToken))
    expect(next.session.tokenHash).toBe(sha256(next.refreshToken))
    expect(next.session.rotatedAt?.getTime()).toBe(T0.getTime() + 1000)
  })

  test('the previous hash within the grace window rotates again without revoking', async () => {
    const first = await createSession('u1')
    const oldHash = sha256(first.refreshToken)
    await rotateSession({ sessionId: first.session.id, presentedHash: oldHash })
    at(29_000)
    const retry = await rotateSession({ sessionId: first.session.id, presentedHash: oldHash })
    expect(retry.session.revokedAt).toBeUndefined()
    expect((await sessions().get(first.session.id))?.revokedAt).toBeUndefined()
  })

  test('a grace hit answers with the winner token and extends nothing', async () => {
    const first = await createSession('u1')
    const oldHash = sha256(first.refreshToken)
    at(1000)
    const winner = await rotateSession({ sessionId: first.session.id, presentedHash: oldHash })
    at(20_000)
    const retry = await rotateSession({ sessionId: first.session.id, presentedHash: oldHash })

    expect(retry.refreshToken).toBe(winner.refreshToken)
    expect(retry.refreshExpiresAt.getTime()).toBe(winner.refreshExpiresAt.getTime())
    expect(retry.session.id).toBe(first.session.id)
    const stored = await sessions().get(first.session.id)
    expect(stored?.tokenHash).toBe(sha256(winner.refreshToken))
    expect(stored?.expiresAt.getTime()).toBe(winner.session.expiresAt.getTime())
    expect(stored?.lastUsedAt.getTime()).toBe(T0.getTime() + 20_000)
  })

  test('two concurrent rotations with one token converge on one live token', async () => {
    const first = await createSession('u1')
    const presentedHash = sha256(first.refreshToken)
    const [a, b] = await Promise.all([
      rotateSession({ sessionId: first.session.id, presentedHash }),
      rotateSession({ sessionId: first.session.id, presentedHash }),
    ])

    expect(a.refreshToken).toBe(b.refreshToken)
    expect((await sessions().get(first.session.id))?.tokenHash).toBe(sha256(a.refreshToken))
    at(15 * 60_000)
    const later = await rotateSession({
      sessionId: first.session.id,
      presentedHash: sha256(a.refreshToken),
    })
    expect(later.refreshToken).not.toBe(a.refreshToken)
    expect((await sessions().get(first.session.id))?.revokedAt).toBeUndefined()
  })

  test('the compare-and-set re-run answers from the winner when the record changed under it', async () => {
    const first = await createSession('u1')
    const presentedHash = sha256(first.refreshToken)
    const winner = await rotateSession({ sessionId: first.session.id, presentedHash })
    // Simulate the loser that read before the winner wrote: the record it then re-reads has
    // the presented hash as previousTokenHash.
    const stored = await sessions().get(first.session.id)
    if (stored === undefined) throw new Error('missing')
    const original = memory.collection.bind(memory)
    const real = (id: string) => original<SessionRecord>('session').get(id)
    let reads = 0
    const spy = spyOn(memory, 'collection').mockImplementation(((name: string) => {
      const collection = original<SessionRecord>(name)
      if (name !== 'session') return collection
      return {
        ...collection,
        get: async (id: string) => {
          reads++
          // First read: the pre-rotation record; second read: the stored winner.
          if (reads > 1) return real(id)
          const { previousTokenHash: _previous, graceToken: _grace, ...before } = stored
          return { ...before, tokenHash: presentedHash }
        },
      }
    }) as typeof memory.collection)
    try {
      const loser = await rotateSession({ sessionId: first.session.id, presentedHash })
      expect(loser.refreshToken).toBe(winner.refreshToken)
    } finally {
      spy.mockRestore()
    }
  })

  test('a normal rotation replaces the grace token and revocation drops it', async () => {
    const first = await createSession('u1')
    const one = await rotateSession({
      sessionId: first.session.id,
      presentedHash: sha256(first.refreshToken),
    })
    const storedOne = await sessions().get(first.session.id)
    expect(storedOne?.graceToken).toBeDefined()
    expect(storedOne?.graceToken).not.toContain(one.refreshToken)
    at(1000)
    const two = await rotateSession({
      sessionId: first.session.id,
      presentedHash: sha256(one.refreshToken),
    })
    expect(decrypt((await sessions().get(first.session.id))?.graceToken ?? '')).toBe(
      two.refreshToken,
    )

    await revokeSession(first.session.id)
    expect((await sessions().get(first.session.id))?.graceToken).toBeUndefined()
  })

  test('a record without a grace token falls back to revoking every session', async () => {
    const first = await createSession('u1')
    const oldHash = sha256(first.refreshToken)
    await rotateSession({ sessionId: first.session.id, presentedHash: oldHash })
    const stored = await sessions().get(first.session.id)
    if (stored === undefined) throw new Error('missing')
    const { graceToken: _dropped, ...damaged } = stored
    await sessions().put(damaged)

    expect(
      await failureOf(rotateSession({ sessionId: first.session.id, presentedHash: oldHash })),
    ).toMatchObject({ code: 'unauthenticated' })
    expect((await sessions().get(first.session.id))?.revokedAt).toBeDefined()
  })

  test('the previous hash after the grace window revokes every session of the user', async () => {
    const earlier = await createSession('u1')
    const first = await createSession('u1')
    const oldHash = sha256(first.refreshToken)
    await rotateSession({ sessionId: first.session.id, presentedHash: oldHash })
    at(31_000)
    expect(
      await failureOf(rotateSession({ sessionId: first.session.id, presentedHash: oldHash })),
    ).toMatchObject({ code: 'unauthenticated', message: 'invalid refresh token' })
    expect((await sessions().get(first.session.id))?.revokedAt).toBeDefined()
    expect((await sessions().get(earlier.session.id))?.revokedAt).toBeDefined()
  })

  test('an unknown hash revokes every session of the user', async () => {
    const first = await createSession('u1')
    expect(
      await failureOf(
        rotateSession({ sessionId: first.session.id, presentedHash: sha256('nope') }),
      ),
    ).toMatchObject({ code: 'unauthenticated', message: 'invalid refresh token' })
    expect((await sessions().get(first.session.id))?.revokedAt).toBeDefined()
  })

  test('exactly 30 s after the rotation the previous hash still rotates (<=)', async () => {
    const first = await createSession('u1')
    const oldHash = sha256(first.refreshToken)
    await rotateSession({ sessionId: first.session.id, presentedHash: oldHash })
    at(30_000)
    const retry = await rotateSession({ sessionId: first.session.id, presentedHash: oldHash })
    expect(retry.session.revokedAt).toBeUndefined()
  })

  test('a rotation racing a revoke does not resurrect the session', async () => {
    const first = await createSession('u1')
    const rotation = failureOf(
      rotateSession({ sessionId: first.session.id, presentedHash: sha256(first.refreshToken) }),
    )
    const revocation = revokeSession(first.session.id)
    const [error] = await Promise.all([rotation, revocation])
    expect(error).toMatchObject({ code: 'unauthenticated', message: 'invalid refresh token' })
    expect((await sessions().get(first.session.id))?.revokedAt).toBeDefined()
  })

  test('an unknown session throws', async () => {
    expect(
      await failureOf(rotateSession({ sessionId: 'missing', presentedHash: 'x' })),
    ).toMatchObject({ code: 'unauthenticated', message: 'invalid refresh token' })
  })

  test('a revoked session throws and leaves the other session live', async () => {
    const other = await createSession('u1')
    const first = await createSession('u1')
    await revokeSession(first.session.id)
    expect(
      await failureOf(
        rotateSession({ sessionId: first.session.id, presentedHash: sha256(first.refreshToken) }),
      ),
    ).toMatchObject({ code: 'unauthenticated', message: 'invalid refresh token' })
    expect((await sessions().get(other.session.id))?.revokedAt).toBeUndefined()
  })

  test('an expired session throws and leaves the other session live', async () => {
    const first = await createSession('u1')
    at(20 * DAY)
    const other = await createSession('u1')
    at(31 * DAY)
    expect(
      await failureOf(
        rotateSession({ sessionId: first.session.id, presentedHash: sha256(first.refreshToken) }),
      ),
    ).toMatchObject({ code: 'unauthenticated', message: 'invalid refresh token' })
    expect((await sessions().get(other.session.id))?.revokedAt).toBeUndefined()
  })

  test('rotation extends expiresAt by 30 days from the rotation time', async () => {
    const first = await createSession('u1')
    at(10 * DAY)
    const next = await rotateSession({
      sessionId: first.session.id,
      presentedHash: sha256(first.refreshToken),
    })
    expect(next.session.expiresAt.getTime()).toBe(T0.getTime() + 40 * DAY)
    expect(next.refreshExpiresAt.getTime()).toBe(next.session.expiresAt.getTime())
  })

  test('expiresAt never passes absoluteExpiresAt', async () => {
    let issued = await createSession('u1')
    // Rotate every 25 days to keep the session alive, then at day 85 (85 + 30 > 90).
    for (const day of [25, 50, 75, 85]) {
      at(day * DAY)
      issued = await rotateSession({
        sessionId: issued.session.id,
        presentedHash: issued.session.tokenHash,
      })
    }
    expect(issued.session.expiresAt.getTime()).toBe(issued.session.absoluteExpiresAt.getTime())
  })
})

describe('revoke and purge', () => {
  test('revokeSession is idempotent', async () => {
    const { session } = await createSession('u1')
    await revokeSession(session.id)
    const firstRevoked = (await sessions().get(session.id))?.revokedAt
    at(5000)
    await revokeSession(session.id)
    expect((await sessions().get(session.id))?.revokedAt).toEqual(firstRevoked)
    await revokeSession('missing')
  })

  test('revokeAllSessions returns the count and spares other users', async () => {
    await createSession('u1')
    await createSession('u1')
    const other = await createSession('u2')
    expect(await revokeAllSessions('u1')).toBe(2)
    expect(await revokeAllSessions('u1')).toBe(0)
    expect((await sessions().get(other.session.id))?.revokedAt).toBeUndefined()
  })

  test('purgeExpired removes expired and revoked sessions and keeps live ones', async () => {
    const expired = await createSession('u1')
    const revoked = await createSession('u2')
    await revokeSession(revoked.session.id)
    at(20 * DAY)
    const live = await createSession('u3')
    expect(await purgeExpired(new Date(T0.getTime() + 31 * DAY))).toBe(2)
    expect(await sessions().get(expired.session.id)).toBeUndefined()
    expect(await sessions().get(revoked.session.id)).toBeUndefined()
    expect(await sessions().get(live.session.id)).toBeDefined()
    expect(await purgeExpired(new Date(T0.getTime() + 31 * DAY))).toBe(0)
  })
})
