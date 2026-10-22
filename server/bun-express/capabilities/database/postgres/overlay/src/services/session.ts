// session.ts belongs: refresh sessions with rotation and reuse detection. It keeps its own
// queries because it is not a module and has no service.ts. It does not belong: token
// verification (security/jwt.ts), cookies or HTTP concerns (the auth controller).
//
// This is the Postgres variant: the sessions live in the `session` table
// (infra/migrations/0001-init.sql). The client is taken from `getDb()` per call, and time always
// comes from the caller's clock (`new Date()` or an argument), never from `now()` in SQL.
//
// Concurrency: there is no per-session lock, and the app may run as several processes, so the
// database decides. rotateSession reads, decides as the memory variant does, signs, and then
// writes with one conditional update (`where id = ? and token_hash = ? and revoked_at is null`).
// A write that matches no row means another request rotated or revoked first: the decision is
// re-run against what is stored (a grace hit answers with the winner's token, a revoked session
// is refused, anything else is a replay). Revocation and the grace-path touch are narrow
// filtered updates, never whole-record writes, so a concurrent revoke cannot be overwritten.
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

// The columns as stored; `toRecord` is the only place that maps them to the record.
type SessionRow = {
  id: string
  user_id: string
  token_hash: string
  previous_token_hash: string | null
  rotated_at: Date | null
  grace_token: string | null
  created_at: Date
  last_used_at: Date
  expires_at: Date
  absolute_expires_at: Date
  revoked_at: Date | null
}

// An absent optional is omitted, not `undefined` (exactOptionalPropertyTypes).
function toRecord(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    ...(row.previous_token_hash === null ? {} : { previousTokenHash: row.previous_token_hash }),
    ...(row.rotated_at === null ? {} : { rotatedAt: row.rotated_at }),
    ...(row.grace_token === null ? {} : { graceToken: row.grace_token }),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    absoluteExpiresAt: row.absolute_expires_at,
    ...(row.revoked_at === null ? {} : { revokedAt: row.revoked_at }),
  }
}

async function findSession(sessionId: string): Promise<SessionRecord | undefined> {
  const rows = await getDb()<SessionRow[]>`select * from session where id = ${sessionId}`
  const row = rows[0]
  return row === undefined ? undefined : toRecord(row)
}

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
  await getDb()`
    insert into session (id, user_id, token_hash, created_at, last_used_at, expires_at,
      absolute_expires_at)
    values (${session.id}, ${session.userId}, ${session.tokenHash}, ${session.createdAt},
      ${session.lastUsedAt}, ${session.expiresAt}, ${session.absoluteExpiresAt})`
  return { session, refreshToken: token, refreshExpiresAt: session.expiresAt }
}

// Reuse detection: the current hash rotates; the hash just rotated away is answered, inside
// the grace window, with the token the winning rotation already issued (a client retrying a lost
// response, or two tabs refreshing at once, converge on one live token); any other hash means a
// stolen or replayed token, so every session of the user is revoked.
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

export async function rotateSession({
  sessionId,
  presentedHash,
}: {
  sessionId: string
  presentedHash: string
}): Promise<IssuedSession> {
  const now = new Date()
  const session = await findSession(sessionId)
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
    // Only the touch is written. A revoke that landed since the read leaves no row to touch, and
    // the answer is withheld because a revoked session hands out no token.
    const rows = await getDb()<{ id: string }[]>`
      update session set last_used_at = ${now}
      where id = ${session.id} and revoked_at is null returning id`
    if (rows.length === 0) throw new AppError('unauthenticated', 'invalid refresh token')
    return answer
  }

  const { token } = await signRefresh({
    sub: session.userId,
    sid: session.id,
    jti: randomToken(16),
  })
  // The refresh JWT's own `exp` may outlive a capped `expiresAt`; this record is the authority.
  const expiresAt = new Date(
    Math.min(addDuration(now, REFRESH_TOKEN_TTL).getTime(), session.absoluteExpiresAt.getTime()),
  )
  // Compare-and-set: signing awaits, so a revoke or another rotation may have landed since the
  // read, and the update then matches no row.
  const rows = await getDb()<SessionRow[]>`
    update session set
      previous_token_hash = ${session.tokenHash},
      token_hash = ${sha256(token)},
      rotated_at = ${now},
      last_used_at = ${now},
      expires_at = ${expiresAt},
      grace_token = ${encrypt(token)}
    where id = ${session.id} and token_hash = ${presentedHash} and revoked_at is null
    returning *`
  const rotated = rows[0]
  if (rotated !== undefined) {
    const record = toRecord(rotated)
    return { session: record, refreshToken: token, refreshExpiresAt: record.expiresAt }
  }

  const current = await findSession(sessionId)
  if (current === undefined || current.revokedAt !== undefined) {
    throw new AppError('unauthenticated', 'invalid refresh token')
  }
  // Someone rotated first. Our presented hash is now their previous hash: inside the window
  // that is the grace hit (their token, no write); anything else is a replay.
  if (inGrace(current, presentedHash, now)) return answerFromGrace(current)
  return refuseReuse(current.userId, current.id)
}

// Revocation drops the sealed grace token: a revoked session must not hand out a live token.
// Only a live session matches, so a second revoke keeps the first revocation time.
export async function revokeSession(sessionId: string): Promise<void> {
  await getDb()`
    update session set revoked_at = ${new Date()}, grace_token = null
    where id = ${sessionId} and revoked_at is null`
}

export async function revokeAllSessions(userId: string): Promise<number> {
  const rows = await getDb()<{ id: string }[]>`
    update session set revoked_at = ${new Date()}, grace_token = null
    where user_id = ${userId} and revoked_at is null returning id`
  return rows.length
}

// Called hourly by the scheduler's `session-cleanup` job.
export async function purgeExpired(now: Date = new Date()): Promise<number> {
  const rows = await getDb()<{ id: string }[]>`
    delete from session where revoked_at is not null or expires_at <= ${now} returning id`
  return rows.length
}
