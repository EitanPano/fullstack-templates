// routes.ts belongs: the auth module's router. Each endpoint is one line: its rate limiters, the
// auth middleware, validation, then the controller's handler; the middleware is built once
// above the table. It does not belong: request handling (controller.ts).
import { Router } from 'express'

import { RATE_LIMITS } from '../../config/constants'
import { authenticate, requireAuth } from '../../middleware/auth'
import { byBodyPath, byBodyString, byIp, rateLimit } from '../../middleware/rate-limit'
import { validate } from '../../middleware/validate'
import { login, logout, refresh, register, requestOtp, verifyOtp } from './controller'
import {
  loginRequest,
  logoutRequest,
  otpRequest,
  otpVerificationRequest,
  refreshRequest,
  registerRequest,
} from './schema'

const router = Router()

const registerLimiter = rateLimit({
  name: 'registerPerIp',
  ...RATE_LIMITS.registerPerIp,
  key: byIp,
})
const loginIpLimiter = rateLimit({ name: 'loginPerIp', ...RATE_LIMITS.loginPerIp, key: byIp })
const loginEmailLimiter = rateLimit({
  name: 'loginPerEmail',
  ...RATE_LIMITS.loginPerEmail,
  key: byBodyString('email'),
})
const refreshLimiter = rateLimit({ name: 'refreshPerIp', ...RATE_LIMITS.refreshPerIp, key: byIp })
const otpVerificationLimiter = rateLimit({
  name: 'otpVerificationPerIp',
  ...RATE_LIMITS.otpVerificationPerIp,
  key: byIp,
})
const otpIpLimiter = rateLimit({ name: 'otpPerIp', ...RATE_LIMITS.otpPerIp, key: byIp })
const otpTargetLimiter = rateLimit({
  name: 'otpPerTarget',
  ...RATE_LIMITS.otpPerTarget,
  key: byBodyPath('target', 'value'),
})

const validateRegister = validate(registerRequest)
const validateLogin = validate(loginRequest)
const validateRefresh = validate(refreshRequest)
const validateLogout = validate(logoutRequest)
const validateOtpVerification = validate(otpVerificationRequest)
const validateOtp = validate(otpRequest)

router.post('/register', registerLimiter, validateRegister, register)
router.post('/login', loginIpLimiter, loginEmailLimiter, validateLogin, login)
router.post('/refresh', refreshLimiter, validateRefresh, refresh)
router.post('/logout', requireAuth, validateLogout, logout)
router.post(
  '/otp/verification',
  authenticate,
  otpVerificationLimiter,
  validateOtpVerification,
  verifyOtp,
)
router.post('/otp', authenticate, otpIpLimiter, otpTargetLimiter, validateOtp, requestOtp)

export default router
