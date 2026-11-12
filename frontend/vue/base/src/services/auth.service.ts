import type {
  AuthSession,
  Credentials,
  OtpRequestBody,
  OtpVerificationBody,
  OtpVerified,
} from '@/models/user/type'

import {
  postApiAuthLogin,
  postApiAuthLogout,
  postApiAuthOtp,
  postApiAuthOtpVerification,
  postApiAuthRefresh,
  postApiAuthSignup,
} from './generated/sdk.gen'

// The facade over the auth module of the generated SDK. The session itself lives in HttpOnly
// cookies the server sets, so no call here reads or keeps a token. The refresh wrapper
// (core/interceptors/auth.interceptor.ts) skips the refresh for login, signup, refresh and the
// two OTP calls by their URL. `refresh` is here for the contract's completeness: the wrapper
// calls the endpoint itself.
export const authService = {
  async login(body: Credentials): Promise<AuthSession> {
    const { data } = await postApiAuthLogin({ body, throwOnError: true })
    return data
  },

  async signup(body: Credentials): Promise<AuthSession> {
    const { data } = await postApiAuthSignup({ body, throwOnError: true })
    return data
  },

  // The refresh token travels in its cookie; the body stays empty.
  async refresh(): Promise<AuthSession> {
    const { data } = await postApiAuthRefresh({ body: {}, throwOnError: true })
    return data
  },

  async logout(): Promise<void> {
    await postApiAuthLogout({ body: {}, throwOnError: true })
  },

  async requestOtp(body: OtpRequestBody): Promise<void> {
    await postApiAuthOtp({ body, throwOnError: true })
  },

  async verifyOtp(body: OtpVerificationBody): Promise<OtpVerified> {
    const { data } = await postApiAuthOtpVerification({ body, throwOnError: true })
    return data
  },
}
