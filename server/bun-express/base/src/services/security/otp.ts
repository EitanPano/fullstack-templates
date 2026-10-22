// otp.ts belongs: one-time codes for the login and verify flows: issue a code, verify it once.
// Codes live in the cache as HMAC digests, never as plain text. It does not belong: delivery
// (the auth controller sends the returned code through `services/communicate/`) or logging; this
// file writes no log line so a code can never reach a log.
import { randomInt, timingSafeEqual } from 'node:crypto'
import { OTP_LENGTH, OTP_MAX_ATTEMPTS, OTP_TTL } from '../../config/constants'
import { env } from '../../config/env'
import type { OtpPurpose } from '../../models/auth/enum'
import type { ContactTarget } from '../../models/user/type'
import { del, get, incr, set } from '../cache'
import { parseDuration } from '../utils/time'
import { hmac } from './crypto'

// The attempt counter lives in a sibling key maintained with `incr`, which is atomic on a real
// cache; a counter inside this entry would be a read-modify-write and parallel wrong guesses
// could exceed the cap.
type OtpEntry = { hash: string; userId: string; expiresAt: string }

type Subject = { purpose: OtpPurpose; target: ContactTarget }

function keyOf({ purpose, target }: Subject): string {
  return `otp:${purpose}:${target.type}:${target.value}`
}

function attemptsKeyOf(subject: Subject): string {
  return `${keyOf(subject)}:attempts`
}

function hashOf({ purpose, target }: Subject, code: string): string {
  return hmac(env.OTP_SECRET, `${purpose}:${target.type}:${target.value}:${code}`)
}

// Issuing again for the same purpose and target overwrites the entry, so the previous code dies.
export async function issueOtp({
  purpose,
  target,
  userId,
}: Subject & { userId: string }): Promise<string> {
  const code = randomInt(0, 10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, '0')
  const ttl = parseDuration(OTP_TTL)
  const entry: OtpEntry = {
    hash: hashOf({ purpose, target }, code),
    userId,
    expiresAt: new Date(Date.now() + ttl).toISOString(),
  }
  await del(attemptsKeyOf({ purpose, target }))
  await set(keyOf({ purpose, target }), entry, ttl)
  return code
}

// Returns the userId on a match and consumes the entry; null for anything else.
export async function verifyOtp({
  purpose,
  target,
  code,
}: Subject & { code: string }): Promise<string | null> {
  const key = keyOf({ purpose, target })
  const attemptsKey = attemptsKeyOf({ purpose, target })
  const entry = await get<OtpEntry>(key)
  if (entry === undefined) return null
  const remaining = new Date(entry.expiresAt).getTime() - Date.now()
  if (remaining <= 0) {
    await del(key)
    await del(attemptsKey)
    return null
  }
  // Count before comparing: `incr` is atomic on a real cache, so N parallel guesses are
  // numbered and every one past the cap is refused without its code ever being compared.
  const attempts = await incr(attemptsKey, remaining)
  if (attempts > OTP_MAX_ATTEMPTS) {
    await del(key)
    await del(attemptsKey)
    return null
  }
  const presented = Buffer.from(hashOf({ purpose, target }, code))
  const stored = Buffer.from(entry.hash)
  if (presented.length === stored.length && timingSafeEqual(presented, stored)) {
    await del(key)
    await del(attemptsKey)
    return entry.userId
  }
  return null
}
