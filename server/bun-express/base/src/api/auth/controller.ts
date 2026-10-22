// controller.ts belongs: the auth module's public API and its composition rules. Auth owns no
// data, so it has no service.ts and no repository.ts: the rules of a flow (which sessions to
// create, which checks come before a code is consumed) live here and nowhere else, and the data
// stays behind the user controller and services/session.ts. No `req`, no `res`, no status code.
// It does not belong: HTTP and cookies (route.ts), or a direct store import.
//
// Accepted tradeoffs: register's 409 discloses that an email exists (bounded by the
// registerPerIp limit), and loginPerEmail lets an attacker lock a victim out of password login
// for the window; OTP login is no way round it, since otpPerTarget (5/h) and the overwrite of a
// pending code by a new request let the same attacker starve it too.
import type { OtpPurpose } from '../../models/auth/enum'
import type { AuthSession, AuthTokens, Caller, OtpVerified } from '../../models/auth/type'
import type { ContactTarget, PublicUser } from '../../models/user/type'
import { OTP_TTL } from '../../config/constants'
import { send } from '../../services/communicate'
import { otpTemplate } from '../../services/communicate/templates/otp'
import { log } from '../../services/logger'
import { sha256 } from '../../services/security/crypto'
import { signAccess, verifyRefresh } from '../../services/security/jwt'
import { issueOtp, verifyOtp as consumeOtp } from '../../services/security/otp'
import {
  createSession,
  revokeAllSessions,
  revokeSession,
  rotateSession,
  type IssuedSession,
} from '../../services/session'
import { AppError } from '../../services/utils/error'
import { parseDuration, toIso } from '../../services/utils/time'
import * as user from '../user/controller'
import type { Credentials, OtpRequestBody, OtpVerificationBody } from './schema'

async function tokensFor(account: PublicUser, issued: IssuedSession): Promise<AuthTokens> {
  const access = await signAccess({
    sub: account.id,
    role: account.role,
    sid: issued.session.id,
  })
  return {
    accessToken: access.token,
    accessExpiresAt: toIso(access.expiresAt),
    refreshToken: issued.refreshToken,
    refreshExpiresAt: toIso(issued.refreshExpiresAt),
  }
}

async function issueTokens(account: PublicUser): Promise<AuthTokens> {
  return tokensFor(account, await createSession(account.id))
}

// A deleted account cannot refresh or log in by code: that is an authentication failure, not a
// missing resource. A blocked account keeps its 403.
async function activeUserOrUnauthenticated(id: string): Promise<PublicUser> {
  try {
    return await user.getActiveUser(id)
  } catch (error) {
    if (error instanceof AppError && error.code === 'not_found') {
      throw new AppError('unauthenticated', 'invalid credentials')
    }
    throw error
  }
}

export async function register({ input }: { input: Credentials }): Promise<AuthSession> {
  const account = await user.createUser({ input })
  return { user: account, tokens: await issueTokens(account) }
}

export async function login({ input }: { input: Credentials }): Promise<AuthSession> {
  const account = await user.verifyCredentials({ input })
  return { user: account, tokens: await issueTokens(account) }
}

export async function refresh({
  refreshToken,
}: {
  refreshToken: string | undefined
}): Promise<AuthSession> {
  if (refreshToken === undefined) throw new AppError('validation_failed', 'refresh token missing')
  const claims = await verifyRefresh(refreshToken)
  if (claims === null) throw new AppError('unauthenticated', 'invalid refresh token')
  const account = await activeUserOrUnauthenticated(claims.sub)
  const issued = await rotateSession({
    sessionId: claims.sid,
    presentedHash: sha256(refreshToken),
  })
  return { user: account, tokens: await tokensFor(account, issued) }
}

export async function logout({ caller, all }: { caller: Caller; all: boolean }): Promise<void> {
  if (all) await revokeAllSessions(caller.id)
  else await revokeSession(caller.sessionId)
}

async function assertOwnTarget(caller: Caller, target: ContactTarget): Promise<void> {
  const me = await user.getMe({ caller })
  const own = target.type === 'email' ? me.email : me.phone
  if (own !== target.value) {
    throw new AppError('forbidden', 'target does not belong to the caller')
  }
}

async function deliver(target: ContactTarget, purpose: OtpPurpose, code: string): Promise<void> {
  await send({
    channel: target.type === 'email' ? 'mail' : 'sms',
    to: target.value,
    template: otpTemplate({ code, purpose, ttlMinutes: parseDuration(OTP_TTL) / 60000 }),
  })
}

// The code is never logged: it is handed from issueOtp to the provider and nowhere else.
export async function requestOtp({
  input: { target, purpose },
  caller,
}: {
  input: OtpRequestBody
  caller?: Caller | undefined
}): Promise<void> {
  if (purpose === 'verify') {
    if (caller === undefined) throw new AppError('unauthenticated', 'authentication required')
    await assertOwnTarget(caller, target)
    await deliver(target, purpose, await issueOtp({ purpose, target, userId: caller.id }))
    return
  }
  // Login: answer the same whether or not the account exists, so the endpoint cannot be used to
  // enumerate users. A blocked account gets no code either. Delivery is detached from the
  // request: awaiting a provider only for known targets would make latency reveal which emails
  // exist. The 202 therefore no longer proves delivery (that is the enumeration-safe trade; the
  // rate limits are the backstop) and a delivery failure is logged, never returned.
  const account = await user.findUserByTarget({ target })
  if (account?.status !== 'active') {
    log.info('otp skipped', { reason: account === null ? 'unknown target' : 'not active' })
    return
  }
  const code = await issueOtp({ purpose, target, userId: account.id })
  // Name only: a vendor error can echo the request payload, which carries the code.
  void deliver(target, purpose, code).catch((error: unknown) => {
    log.error('otp delivery failed', {
      channel: target.type === 'email' ? 'mail' : 'sms',
      reason: error instanceof Error ? error.name : 'unknown',
    })
  })
}

export async function verifyOtp({
  input: { target, purpose, code },
  caller,
}: {
  input: OtpVerificationBody
  caller?: Caller | undefined
}): Promise<OtpVerified> {
  if (purpose === 'verify') {
    // Both checks come before the code is consumed, so a wrong caller cannot burn the code.
    if (caller === undefined) throw new AppError('unauthenticated', 'authentication required')
    await assertOwnTarget(caller, target)
    const userId = await consumeOtp({ purpose, target, code })
    if (userId === null || userId !== caller.id) {
      throw new AppError('unauthenticated', 'invalid code')
    }
    return { user: await user.markVerified({ id: userId, type: target.type }) }
  }
  const userId = await consumeOtp({ purpose, target, code })
  if (userId === null) throw new AppError('unauthenticated', 'invalid code')
  const account = await activeUserOrUnauthenticated(userId)
  // The code proved control of the address, so the target counts as verified from here on. If it
  // was not verified before, the account may have been pre-registered by someone who typed the
  // victim's address: every session that exists is then untrusted and is revoked before the
  // legitimate one starts. A password set by that someone stays; password reset is the remedy.
  const wasVerified =
    target.type === 'email' ? account.emailVerifiedAt !== null : account.phoneVerifiedAt !== null
  const verified = await user.markVerified({ id: account.id, type: target.type })
  if (!wasVerified) {
    await revokeAllSessions(account.id)
    log.warn('target verified on login, other sessions revoked', { userId: account.id })
  }
  return { user: verified, tokens: await issueTokens(verified) }
}
