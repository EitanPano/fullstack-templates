// session.ts belongs: refresh sessions with rotation and reuse detection. It keeps its own
// queries because it is not a module and has no repository.ts; the data-layer task rewrites it
// against the chosen engine. It does not belong: token verification (security/jwt.ts), cookies
// or HTTP concerns (the auth controller and route).
//
// The collection is taken from `getDb()` per call so a swapped or reset store is always the
// one used.
//
// Concurrency: the memory store is single-process, so rotateSession serialises per session with
// a lock and also re-reads the record after signing and before writing. The data-layer task must
// drop the lock and implement the write as a conditional update (`where id = ? and tokenHash = ? and revokedAt is null`) and
// revokeAllSessions as an `updateMany` with a filter, not whole-record writes, or a concurrent
// revoke can be overwritten.
import { randomUUID } from 'node:crypto'
import { REFRESH_REUSE_GRACE, REFRESH_TOKEN_TTL, SESSION_ABSOLUTE_TTL } from '../config/constants'
import type { SessionRecord } from '../models/session/interface'
import { getDb } from './db'
import { decrypt, encrypt, randomToken, sha256 } from './security/crypto'
import { signRefresh } from './security/jwt'
import { log } from './logger'
import { AppError } from './utils/error'
import { addDuration, isExpired, parseDuration } from './utils/time'

export type IssuedSession = {
  session: SessionRecord
  refreshToken: string
  refreshExpiresAt: Date
}

const sessions = () => getDb().collection<SessionRecord>('session')

export async function createSession(userId: string): Promise<IssuedSession> {
  const id = randomUUID()
  const now = new Date()
  const { token } = await signRefresh({ sub: userId, sid: id, jti: randomToken(16) })
  const session: SessionRecord = {
    id,
    userId,
    tokenHash: sha256(token),
    expiresAt: addDuration(now, REFRESH_TOKEN_TTL),
    absoluteExpiresAt: addDuration(now, SESSION_ABSOLUTE_TTL),
    createdAt: now,
    lastUsedAt: now,
  }
  await sessions().put(session)
  return { session, refreshToken: token, refreshExpiresAt: session.expiresAt }
}

// Reuse detection: the current hash rotates; the hash just rotated away is answered, inside
// the grace window, with the token the winning rotation already issued (a client retrying a lost
// response, or two tabs refreshing at once, converge on one live token); any other hash means a
// stolen or replayed token, so every session of the user is revoked.
//
// The memory store has no conditional write, so the decision runs under a per-session lock
// (one process, so enough). The re-read after signing stays as the compare-and-set a real
// engine needs: if the record changed under us the decision is re-run against what is stored.
const locks = new Map<string, Promise<unknown>>()

function withLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const run = (locks.get(key) ?? Promise.resolve()).then(work, work)
  const tail = run.catch(() => undefined)
  locks.set(key, tail)
  void tail.then(() => {
    if (locks.get(key) === tail) locks.delete(key)
  })
  return run
}

function inGrace(record: SessionRecord, presentedHash: string, now: Date): boolean {
  return (
    record.previousTokenHash !== undefined &&
    presentedHash === record.previousTokenHash &&
    record.rotatedAt !== undefined &&
    now.getTime() - record.rotatedAt.getTime() <= parseDuration(REFRESH_REUSE_GRACE)
  )
}

async function refuseReuse(userId: string, sessionId: string): Promise<never> {
  await revokeAllSessions(userId)
  log.warn('refresh token reused', { userId, sessionId })
  // Same message as every other refusal so a caller cannot tell which branch failed.
  throw new AppError('unauthenticated', 'invalid refresh token')
}

// A grace hit hands back the token the winning rotation issued, with the record's own expiry:
// it extends nothing and mints nothing, so the holder of the earlier response and the holder of
// this one end up with the same token and neither later looks like a replay.
async function answerFromGrace(record: SessionRecord): Promise<IssuedSession> {
  // graceToken is always set together with previousTokenHash; absent means a damaged record,
  // which is treated like a replay.
  if (record.graceToken === undefined) return refuseReuse(record.userId, record.id)
  return {
    session: record,
    refreshToken: decrypt(record.graceToken),
    refreshExpiresAt: record.expiresAt,
  }
}

export function rotateSession({
  sessionId,
  presentedHash,
}: {
  sessionId: string
  presentedHash: string
}): Promise<IssuedSession> {
  return withLock(sessionId, () => rotate(sessionId, presentedHash))
}

async function rotate(sessionId: string, presentedHash: string): Promise<IssuedSession> {
  const now = new Date()
  const session = await sessions().get(sessionId)
  if (
    session === undefined ||
    session.revokedAt !== undefined ||
    isExpired(session.expiresAt, now)
  ) {
    throw new AppError('unauthenticated', 'invalid refresh token')
  }
  if (presentedHash !== session.tokenHash) {
    if (!inGrace(session, presentedHash, now)) return refuseReuse(session.userId, session.id)
    const touched = { ...session, lastUsedAt: now }
    const answer = await answerFromGrace(touched)
    await sessions().put(touched)
    return answer
  }

  const { token } = await signRefresh({
    sub: session.userId,
    sid: session.id,
    jti: randomToken(16),
  })
  // Compare-and-set: signing awaits, so a revoke or another rotation may have landed since the
  // first read.
  const current = await sessions().get(sessionId)
  if (current === undefined || current.revokedAt !== undefined) {
    throw new AppError('unauthenticated', 'invalid refresh token')
  }
  if (current.tokenHash !== session.tokenHash) {
    // Someone rotated first. Our presented hash is now their previous hash: inside the window
    // that is the grace hit (their token, no write); anything else is a replay.
    if (inGrace(current, presentedHash, now)) return answerFromGrace(current)
    return refuseReuse(current.userId, current.id)
  }
  // The refresh JWT's own `exp` may outlive a capped `expiresAt`; this record is the authority.
  const rotated: SessionRecord = {
    ...current,
    previousTokenHash: current.tokenHash,
    tokenHash: sha256(token),
    rotatedAt: now,
    lastUsedAt: now,
    expiresAt: new Date(
      Math.min(addDuration(now, REFRESH_TOKEN_TTL).getTime(), current.absoluteExpiresAt.getTime()),
    ),
    graceToken: encrypt(token),
  }
  await sessions().put(rotated)
  return { session: rotated, refreshToken: token, refreshExpiresAt: rotated.expiresAt }
}

// Revocation drops the sealed grace token: a revoked session must not hand out a live token.
function revoked(record: SessionRecord, at: Date): SessionRecord {
  const { graceToken: _graceToken, ...rest } = record
  return { ...rest, revokedAt: at }
}

export async function revokeSession(sessionId: string): Promise<void> {
  const session = await sessions().get(sessionId)
  if (session === undefined || session.revokedAt !== undefined) return
  await sessions().put(revoked(session, new Date()))
}

export async function revokeAllSessions(userId: string): Promise<number> {
  const live = await sessions().find(
    (session) => session.userId === userId && session.revokedAt === undefined,
  )
  const now = new Date()
  for (const session of live) await sessions().put(revoked(session, now))
  return live.length
}

// Called hourly by the scheduler's `session-cleanup` job.
export async function purgeExpired(now: Date = new Date()): Promise<number> {
  const dead = await sessions().find(
    (session) => session.revokedAt !== undefined || isExpired(session.expiresAt, now),
  )
  for (const session of dead) await sessions().delete(session.id)
  return dead.length
}
