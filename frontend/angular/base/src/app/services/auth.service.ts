import { Injectable } from '@angular/core'

import type {
  AuthSession,
  Credentials,
  OtpRequestBody,
  OtpVerificationBody,
  OtpVerified,
} from '@app/models/user/type'

import {
  postApiAuthLogin,
  postApiAuthLogout,
  postApiAuthOtp,
  postApiAuthOtpVerification,
  postApiAuthRefresh,
  postApiAuthRegister,
} from './generated/sdk.gen'

// The facade over the auth module of the generated SDK. The session itself lives in HttpOnly
// cookies the server sets, so no call here reads or keeps a token. The auth interceptor skips the
// refresh for login, register, refresh and the two OTP calls by their URL (the generated client
// takes no HttpContext).
@Injectable({ providedIn: 'root' })
export class AuthService {
  async login(body: Credentials): Promise<AuthSession> {
    const { data } = await postApiAuthLogin({ body, throwOnError: true })
    return data
  }

  async register(body: Credentials): Promise<AuthSession> {
    const { data } = await postApiAuthRegister({ body, throwOnError: true })
    return data
  }

  // The refresh token travels in its cookie; the body stays empty.
  async refresh(): Promise<AuthSession> {
    const { data } = await postApiAuthRefresh({ body: {}, throwOnError: true })
    return data
  }

  async logout(): Promise<void> {
    await postApiAuthLogout({ body: {}, throwOnError: true })
  }

  async requestOtp(body: OtpRequestBody): Promise<void> {
    await postApiAuthOtp({ body, throwOnError: true })
  }

  async verifyOtp(body: OtpVerificationBody): Promise<OtpVerified> {
    const { data } = await postApiAuthOtpVerification({ body, throwOnError: true })
    return data
  }
}
