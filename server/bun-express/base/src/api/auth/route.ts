// route.ts belongs: the auth module's HTTP adapter. Per endpoint it mounts the rate limiters
// and the auth middleware, validates the request, reads or writes the cookies (transport lives
// here and only here), calls one controller function and sends the status and body.
// It does not belong: business rules (controller.ts).
import { Router } from 'express'

import { RATE_LIMITS } from '../../config/constants'
import { authenticate, requireAuth, requireCaller } from '../../middleware/auth'
import { byBodyPath, byBodyString, byIp, rateLimit } from '../../middleware/rate-limit'
import { readInput, validate } from '../../middleware/validate'
import { clearAuthCookies, readRefreshToken, setAuthCookies } from '../../services/security/cookies'
import * as controller from './controller'
import { Credentials, LogoutBody, OtpRequestBody, OtpVerificationBody, RefreshBody } from './schema'

export const authRoute = Router()

const credentialsInput = { body: Credentials }
const refreshInput = { body: RefreshBody }
const logoutInput = { body: LogoutBody }
const otpInput = { body: OtpRequestBody }
const otpVerificationInput = { body: OtpVerificationBody }

authRoute.post(
  '/register',
  rateLimit({ name: 'registerPerIp', ...RATE_LIMITS.registerPerIp, key: byIp }),
  validate(credentialsInput),
  async (_req, res) => {
    const { body } = readInput(res, credentialsInput)
    const session = await controller.register({ input: body })
    setAuthCookies(res, session.tokens)
    res.setHeader('Cache-Control', 'no-store')
    res.status(201).json(session)
  },
)

authRoute.post(
  '/login',
  rateLimit({ name: 'loginPerIp', ...RATE_LIMITS.loginPerIp, key: byIp }),
  rateLimit({ name: 'loginPerEmail', ...RATE_LIMITS.loginPerEmail, key: byBodyString('email') }),
  validate(credentialsInput),
  async (_req, res) => {
    const { body } = readInput(res, credentialsInput)
    const session = await controller.login({ input: body })
    setAuthCookies(res, session.tokens)
    res.setHeader('Cache-Control', 'no-store')
    res.json(session)
  },
)

authRoute.post(
  '/refresh',
  rateLimit({ name: 'refreshPerIp', ...RATE_LIMITS.refreshPerIp, key: byIp }),
  validate(refreshInput),
  async (req, res) => {
    const session = await controller.refresh({ refreshToken: readRefreshToken(req) })
    setAuthCookies(res, session.tokens)
    res.setHeader('Cache-Control', 'no-store')
    res.json(session)
  },
)

authRoute.post('/logout', requireAuth, validate(logoutInput), async (_req, res) => {
  const { body } = readInput(res, logoutInput)
  await controller.logout({ caller: requireCaller(res), all: body.all })
  clearAuthCookies(res)
  res.status(204).end()
})

authRoute.post(
  '/otp/verification',
  authenticate,
  rateLimit({ name: 'otpVerificationPerIp', ...RATE_LIMITS.otpVerificationPerIp, key: byIp }),
  validate(otpVerificationInput),
  async (_req, res) => {
    const { body } = readInput(res, otpVerificationInput)
    const result = await controller.verifyOtp({ input: body, caller: res.locals.caller })
    if (result.tokens !== undefined) {
      setAuthCookies(res, result.tokens)
      res.setHeader('Cache-Control', 'no-store')
    }
    res.json(result)
  },
)

authRoute.post(
  '/otp',
  authenticate,
  rateLimit({ name: 'otpPerIp', ...RATE_LIMITS.otpPerIp, key: byIp }),
  rateLimit({
    name: 'otpPerTarget',
    ...RATE_LIMITS.otpPerTarget,
    key: byBodyPath('target', 'value'),
  }),
  validate(otpInput),
  async (_req, res) => {
    const { body } = readInput(res, otpInput)
    await controller.requestOtp({ input: body, caller: res.locals.caller })
    res.status(202).json({})
  },
)
