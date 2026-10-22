// controller.ts belongs: the auth module's logic and its HTTP handlers, one per endpoint, named
// after its operation (`login`). Auth owns no data, so it has no service.ts: the rules of a flow
// (which sessions to create, which checks come before a code is consumed) live in its handlers
// and nowhere else, and the data stays behind the user controller and services/session.ts. Each
// handler reads the input validate() parsed, runs the flow, reads or writes the cookies
// (transport lives here and only here) and sends the status and body.
// It does not belong: middleware (routes.ts) or a direct store import.
//
// Accepted tradeoffs: register's 409 discloses that an email exists (bounded by the
// registerPerIp limit), and loginPerEmail lets an attacker lock a victim out of password login
// for the window; OTP login is no way round it, since otpPerTarget (5/h) and the overwrite of a
// pending code by a new request let the same attacker starve it too.
import type { Request, Response } from 'express'

import { requireCaller } from '../../middleware/auth'
import { readInput } from '../../middleware/validate'
import type { OtpPurpose } from '../../models/auth/enum'
import type { AuthSession, AuthTokens, Caller, OtpVerified } from '../../models/auth/type'
import type { ContactTarget, PublicUser } from '../../models/user/type'
import { OTP_TTL } from '../../config/constants'
import { send } from '../../services/communicate'
import { otpTemplate } from '../../services/communicate/templates/otp'
import { log } from '../../services/logger'
import { DUMMY_HASH, sha256, verifyPassword } from '../../services/security/crypto'
import { clearAuthCookies, readRefreshToken, setAuthCookies } from '../../services/security/cookies'
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
import {
  type Credentials,
  loginRequest,
  logoutRequest,
  otpRequest,
  otpVerificationRequest,
  registerRequest,
} from './schema'

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

// Every credential failure costs one password verification and gives one message, so neither
// timing nor text tells a caller whether the email exists. The blocked check comes after the
// password so a wrong password never learns that the account is blocked. The hash is read here
// and nowhere else in auth, and never returned.
async function verifyCredentials({ email, password }: Credentials): Promise<PublicUser> {
  const found = await user.findUserByEmail(email)
  const hash = found?.passwordHash
  if (found === null || hash === undefined) {
    await verifyPassword(password, DUMMY_HASH)
    throw new AppError('unauthenticated', 'invalid credentials')
  }
  if (!(await verifyPassword(password, hash))) {
    throw new AppError('unauthenticated', 'invalid credentials')
  }
  if (found.user.status === 'blocked') throw new AppError('forbidden', 'account blocked')
  return found.user
}

async function assertOwnTarget(caller: Caller, target: ContactTarget): Promise<void> {
  const me = await user.getCallerUser(caller)
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

// HTTP handlers: routes.ts mounts each one behind its rate limiters and auth middleware.

export async function register(_req: Request, res: Response): Promise<void> {
  const { body } = readInput(res, registerRequest)
  const account = await user.createUser(body)
  const session: AuthSession = { user: account, tokens: await issueTokens(account) }
  setAuthCookies(res, session.tokens)
  res.setHeader('Cache-Control', 'no-store')
  res.status(201).json(session)
}

export async function login(_req: Request, res: Response): Promise<void> {
  const { body } = readInput(res, loginRequest)
  const account = await verifyCredentials(body)
  const session: AuthSession = { user: account, tokens: await issueTokens(account) }
  setAuthCookies(res, session.tokens)
  res.setHeader('Cache-Control', 'no-store')
  res.json(session)
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const refreshToken = readRefreshToken(req)
  if (refreshToken === undefined) throw new AppError('validation_failed', 'refresh token missing')
  const claims = await verifyRefresh(refreshToken)
  if (claims === null) throw new AppError('unauthenticated', 'invalid refresh token')
  const account = await activeUserOrUnauthenticated(claims.sub)
  const issued = await rotateSession({
    sessionId: claims.sid,
    presentedHash: sha256(refreshToken),
  })
  const session: AuthSession = { user: account, tokens: await tokensFor(account, issued) }
  setAuthCookies(res, session.tokens)
  res.setHeader('Cache-Control', 'no-store')
  res.json(session)
}

export async function logout(_req: Request, res: Response): Promise<void> {
  const { body } = readInput(res, logoutRequest)
  const caller = requireCaller(res)
  if (body.all) await revokeAllSessions(caller.id)
  else await revokeSession(caller.sessionId)
  clearAuthCookies(res)
  res.status(204).end()
}

export async function verifyOtp(_req: Request, res: Response): Promise<void> {
  const { target, purpose, code } = readInput(res, otpVerificationRequest).body
  const caller = res.locals.caller
  if (purpose === 'verify') {
    // Both checks come before the code is consumed, so a wrong caller cannot burn the code.
    if (caller === undefined) throw new AppError('unauthenticated', 'authentication required')
    await assertOwnTarget(caller, target)
    const userId = await consumeOtp({ purpose, target, code })
    if (userId === null || userId !== caller.id) {
      throw new AppError('unauthenticated', 'invalid code')
    }
    const result: OtpVerified = { user: await user.markVerified(userId, target.type) }
    res.json(result)
    return
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
  const verified = await user.markVerified(account.id, target.type)
  if (!wasVerified) {
    await revokeAllSessions(account.id)
    log.warn('target verified on login, other sessions revoked', { userId: account.id })
  }
  const session: AuthSession = { user: verified, tokens: await issueTokens(verified) }
  setAuthCookies(res, session.tokens)
  res.setHeader('Cache-Control', 'no-store')
  res.json(session)
}

// The code is never logged: it is handed from issueOtp to the provider and nowhere else.
export async function requestOtp(_req: Request, res: Response): Promise<void> {
  const { target, purpose } = readInput(res, otpRequest).body
  const caller = res.locals.caller
  if (purpose === 'verify') {
    if (caller === undefined) throw new AppError('unauthenticated', 'authentication required')
    await assertOwnTarget(caller, target)
    await deliver(target, purpose, await issueOtp({ purpose, target, userId: caller.id }))
    res.status(202).json({})
    return
  }
  // Login: answer the same whether or not the account exists, so the endpoint cannot be used to
  // enumerate users. A blocked account gets no code either. Delivery is detached from the
  // request: awaiting a provider only for known targets would make latency reveal which emails
  // exist. The 202 therefore no longer proves delivery (that is the enumeration-safe trade; the
  // rate limits are the backstop) and a delivery failure is logged, never returned.
  const account = await user.findUserByTarget(target)
  if (account?.status === 'active') {
    const code = await issueOtp({ purpose, target, userId: account.id })
    // Name only: a vendor error can echo the request payload, which carries the code.
    void deliver(target, purpose, code).catch((error: unknown) => {
      log.error('otp delivery failed', {
        channel: target.type === 'email' ? 'mail' : 'sms',
        reason: error instanceof Error ? error.name : 'unknown',
      })
    })
  } else {
    log.info('otp skipped', { reason: account === null ? 'unknown target' : 'not active' })
  }
  res.status(202).json({})
}
