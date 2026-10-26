import { afterEach, beforeEach, expect, setSystemTime, spyOn, test } from 'bun:test'
import { getDb } from '../../src/services/db'
import { AppError } from '../../src/services/utils/error'
import { decrypt, sha256 } from '../../src/services/security/crypto'
import * as jwt from '../../src/services/security/jwt'
import {
  createSession,
  purgeExpired,
  revokeAllSessions,
  revokeSession,
  rotateSession,
} from '../../src/services/session'
import { captureLogs } from '../logs'
import { describeStore, resetStore } from '../store'

const DAY = 86_400_000
const T0 = new Date('2026-01-01T00:00:00Z')

type StoredRow = {
  token_hash: string
  previous_token_hash: string | null
  grace_token: string | null
  last_used_at: Date
  expires_at: Date
  absolute_expires_at: Date
  revoked_at: Date | null
}

// The stored row as the tests read it: absent columns come back undefined, and the session is
// found by SQL rather than through the service under test.
async function stored(id: string) {
  const rows = await getDb()<StoredRow[]>`select * from session where id = ${id}`
  const row = rows[0]
  if (row === undefined) return undefined
  return {
    tokenHash: row.token_hash,
    previousTokenHash: row.previous_token_hash ?? undefined,
    graceToken: row.grace_token ?? undefined,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    absoluteExpiresAt: row.absolute_expires_at,
    revokedAt: row.revoked_at ?? undefined,
  }
}

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

// Reusing a rotated token is logged on purpose.
let logs: ReturnType<typeof captureLogs>

beforeEach(async () => {
  logs = captureLogs([/^refresh token reused /])
  await resetStore()
  setSystemTime(T0)
})
afterEach(() => {
  logs.restore()
  setSystemTime()
})

describeStore('createSession', () => {
  test('stores the hash of the token, never the token', async () => {
    const { session, refreshToken } = await createSession('u1')
    const row = await stored(session.id)
    expect(row?.tokenHash).toBe(sha256(refreshToken))
    expect(JSON.stringify(row)).not.toContain(refreshToken)
    expect(row?.expiresAt.getTime()).toBe(T0.getTime() + 30 * DAY)
    expect(row?.absoluteExpiresAt.getTime()).toBe(T0.getTime() + 90 * DAY)
  })
})

describeStore('rotateSession', () => {
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
    expect((await stored(first.session.id))?.revokedAt).toBeUndefined()
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
    const row = await stored(first.session.id)
    expect(row?.tokenHash).toBe(sha256(winner.refreshToken))
    expect(row?.expiresAt.getTime()).toBe(winner.session.expiresAt.getTime())
    expect(row?.lastUsedAt.getTime()).toBe(T0.getTime() + 20_000)
  })

  test('two concurrent rotations with one token converge on one live token', async () => {
    const first = await createSession('u1')
    const presentedHash = sha256(first.refreshToken)
    const [a, b] = await Promise.all([
      rotateSession({ sessionId: first.session.id, presentedHash }),
      rotateSession({ sessionId: first.session.id, presentedHash }),
    ])

    // Exactly one rotation happened: the loser was answered from the winner's grace token.
    expect(a.refreshToken).toBe(b.refreshToken)
    const row = await stored(first.session.id)
    expect(row?.tokenHash).toBe(sha256(a.refreshToken))
    expect(row?.previousTokenHash).toBe(presentedHash)
    expect(row?.revokedAt).toBeUndefined()
    at(15 * 60_000)
    const later = await rotateSession({
      sessionId: first.session.id,
      presentedHash: sha256(a.refreshToken),
    })
    expect(later.refreshToken).not.toBe(a.refreshToken)
    expect((await stored(first.session.id))?.revokedAt).toBeUndefined()
  })

  test('the compare-and-set re-run answers from the winner when the record changed under it', async () => {
    const first = await createSession('u1')
    const presentedHash = sha256(first.refreshToken)
    // The loser has read the pre-rotation record when it starts signing; the winner rotates
    // during that await, so the loser's conditional update matches no row and it re-reads.
    const real = jwt.signRefresh
    let winner: Awaited<ReturnType<typeof rotateSession>> | undefined
    let calls = 0
    const spy = spyOn(jwt, 'signRefresh').mockImplementation(async (claims) => {
      calls++
      if (calls === 1) {
        winner = await rotateSession({ sessionId: first.session.id, presentedHash })
      }
      return real(claims)
    })
    try {
      const loser = await rotateSession({ sessionId: first.session.id, presentedHash })
      expect(winner).toBeDefined()
      expect(loser.refreshToken).toBe(winner?.refreshToken ?? '')
      expect((await stored(first.session.id))?.tokenHash).toBe(sha256(loser.refreshToken))
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
    const storedOne = await stored(first.session.id)
    expect(storedOne?.graceToken).toBeDefined()
    expect(storedOne?.graceToken).not.toContain(one.refreshToken)
    at(1000)
    const two = await rotateSession({
      sessionId: first.session.id,
      presentedHash: sha256(one.refreshToken),
    })
    expect(decrypt((await stored(first.session.id))?.graceToken ?? '')).toBe(two.refreshToken)

    await revokeSession(first.session.id)
    expect((await stored(first.session.id))?.graceToken).toBeUndefined()
  })

  test('a record without a grace token falls back to revoking every session', async () => {
    const first = await createSession('u1')
    const oldHash = sha256(first.refreshToken)
    await rotateSession({ sessionId: first.session.id, presentedHash: oldHash })
    await getDb()`update session set grace_token = null where id = ${first.session.id}`

    expect(
      await failureOf(rotateSession({ sessionId: first.session.id, presentedHash: oldHash })),
    ).toMatchObject({ code: 'unauthenticated' })
    expect((await stored(first.session.id))?.revokedAt).toBeDefined()
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
    expect((await stored(first.session.id))?.revokedAt).toBeDefined()
    expect((await stored(earlier.session.id))?.revokedAt).toBeDefined()
  })

  test('an unknown hash revokes every session of the user', async () => {
    const first = await createSession('u1')
    expect(
      await failureOf(
        rotateSession({ sessionId: first.session.id, presentedHash: sha256('nope') }),
      ),
    ).toMatchObject({ code: 'unauthenticated', message: 'invalid refresh token' })
    expect((await stored(first.session.id))?.revokedAt).toBeDefined()
  })

  test('exactly 30 s after the rotation the previous hash still rotates (<=)', async () => {
    const first = await createSession('u1')
    const oldHash = sha256(first.refreshToken)
    await rotateSession({ sessionId: first.session.id, presentedHash: oldHash })
    at(30_000)
    const retry = await rotateSession({ sessionId: first.session.id, presentedHash: oldHash })
    expect(retry.session.revokedAt).toBeUndefined()
  })

  test('a rotation racing a revoke leaves the session revoked', async () => {
    const first = await createSession('u1')
    const [outcome] = await Promise.allSettled([
      rotateSession({ sessionId: first.session.id, presentedHash: sha256(first.refreshToken) }),
      revokeSession(first.session.id),
    ])
    // Either order is legal: the rotation lands before the revoke (and is then revoked) or is
    // refused. It never resurrects the session.
    if (outcome.status === 'rejected') {
      expect(outcome.reason).toMatchObject({
        code: 'unauthenticated',
        message: 'invalid refresh token',
      })
    }
    const row = await stored(first.session.id)
    expect(row?.revokedAt).toBeDefined()
    expect(row?.graceToken).toBeUndefined()
  })

  test('a rotation signing while the session is revoked is refused and stays revoked', async () => {
    const first = await createSession('u1')
    const real = jwt.signRefresh
    const spy = spyOn(jwt, 'signRefresh').mockImplementation(async (claims) => {
      await revokeSession(first.session.id)
      return real(claims)
    })
    try {
      expect(
        await failureOf(
          rotateSession({ sessionId: first.session.id, presentedHash: sha256(first.refreshToken) }),
        ),
      ).toMatchObject({ code: 'unauthenticated', message: 'invalid refresh token' })
    } finally {
      spy.mockRestore()
    }
    const row = await stored(first.session.id)
    expect(row?.revokedAt).toBeDefined()
    expect(row?.tokenHash).toBe(sha256(first.refreshToken))
  })

  test('a grace hit is refused when the session is revoked before the touch', async () => {
    const first = await createSession('u1')
    const oldHash = sha256(first.refreshToken)
    await rotateSession({ sessionId: first.session.id, presentedHash: oldHash })
    at(1000)
    // An open transaction revokes the row; the grace retry reads the unrevoked row (MVCC), then
    // its touch blocks on the row lock. Committing lets the touch re-check `revoked_at is null`.
    // A row-lock wait is an ungranted `transactionid` lock; that lock type carries no database
    // column, so the waiting backends are matched to this database through pg_stat_activity.
    let retry: Promise<unknown> | undefined
    await getDb().begin(async (tx) => {
      await tx`update session set revoked_at = ${new Date()}, grace_token = null
        where id = ${first.session.id}`
      retry = failureOf(rotateSession({ sessionId: first.session.id, presentedHash: oldHash }))
      for (let attempt = 0; attempt < 100; attempt++) {
        const [waiting] = await getDb()<{ n: number }[]>`
          select count(*)::int as n from pg_locks
          where not granted and locktype = 'transactionid'
            and pid in (select pid from pg_stat_activity where datname = current_database())`
        if ((waiting?.n ?? 0) > 0) return
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      throw new Error('the grace touch never waited on the row lock')
    })

    expect(await retry).toMatchObject({ code: 'unauthenticated', message: 'invalid refresh token' })
    expect((await stored(first.session.id))?.revokedAt).toBeDefined()
  })

  test('a revoke-all racing a rotation leaves the session revoked', async () => {
    const first = await createSession('u1')
    await Promise.allSettled([
      rotateSession({ sessionId: first.session.id, presentedHash: sha256(first.refreshToken) }),
      revokeAllSessions('u1'),
    ])
    const row = await stored(first.session.id)
    expect(row?.revokedAt).toBeDefined()
    expect(row?.graceToken).toBeUndefined()
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
    expect((await stored(other.session.id))?.revokedAt).toBeUndefined()
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
    expect((await stored(other.session.id))?.revokedAt).toBeUndefined()
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
    expect((await stored(issued.session.id))?.expiresAt.getTime()).toBe(
      issued.session.absoluteExpiresAt.getTime(),
    )
  })
})

describeStore('revoke and purge', () => {
  test('revokeSession is idempotent', async () => {
    const { session } = await createSession('u1')
    await revokeSession(session.id)
    const firstRevoked = (await stored(session.id))?.revokedAt
    expect(firstRevoked).toBeDefined()
    at(5000)
    await revokeSession(session.id)
    expect((await stored(session.id))?.revokedAt).toEqual(firstRevoked)
    await revokeSession('missing')
  })

  test('revokeAllSessions returns the count and spares other users', async () => {
    await createSession('u1')
    await createSession('u1')
    const other = await createSession('u2')
    expect(await revokeAllSessions('u1')).toBe(2)
    expect(await revokeAllSessions('u1')).toBe(0)
    expect((await stored(other.session.id))?.revokedAt).toBeUndefined()
  })

  test('purgeExpired removes expired and revoked sessions and keeps live ones', async () => {
    const expired = await createSession('u1')
    const revoked = await createSession('u2')
    await revokeSession(revoked.session.id)
    at(20 * DAY)
    const live = await createSession('u3')
    expect(await purgeExpired(new Date(T0.getTime() + 31 * DAY))).toBe(2)
    expect(await stored(expired.session.id)).toBeUndefined()
    expect(await stored(revoked.session.id)).toBeUndefined()
    expect(await stored(live.session.id)).toBeDefined()
    expect(await purgeExpired(new Date(T0.getTime() + 31 * DAY))).toBe(0)
  })
})
