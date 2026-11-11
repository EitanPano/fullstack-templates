import { provideHttpClient, withInterceptors } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'

import { provideApiClient } from '@app/core/config/api-client.provider'
import { errorInterceptor } from '@app/core/interceptors/error.interceptor'
import { isApiError } from '@app/services/api-error'

import { AuthService } from './auth.service'

const USER = { id: '1', email: 'ada@example.com', role: 'user' }
const SESSION = { user: USER, tokens: { accessToken: 'a' } }
const CREDENTIALS = { email: 'ada@example.com', password: 'longenough1' }
const TARGET = { type: 'email', value: 'ada@example.com' } as const

describe('AuthService', () => {
  let service: AuthService
  let http: HttpTestingController

  // The generated client issues its request after one internal await.
  async function request(path: string) {
    await Promise.resolve()
    return http.expectOne((req) => new URL(req.url).pathname === path)
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        provideApiClient(),
      ],
    })
    service = TestBed.inject(AuthService)
    http = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    http.verify()
  })

  it('logs in with the credentials and returns the session', async () => {
    const result = service.login(CREDENTIALS)
    const call = await request('/api/auth/login')
    expect(call.request.method).toBe('POST')
    expect(call.request.body).toEqual(CREDENTIALS)
    call.flush(SESSION)
    expect(await result).toEqual(SESSION)
  })

  it('registers with the credentials', async () => {
    const result = service.register(CREDENTIALS)
    const call = await request('/api/auth/register')
    expect(call.request.body).toEqual(CREDENTIALS)
    call.flush(SESSION)
    expect(await result).toEqual(SESSION)
  })

  it('refreshes with an empty body (the cookie carries the token)', async () => {
    const result = service.refresh()
    const call = await request('/api/auth/refresh')
    expect(call.request.body).toEqual({})
    call.flush(SESSION)
    await result
  })

  it('logs out', async () => {
    const result = service.logout()
    const call = await request('/api/auth/logout')
    expect(call.request.method).toBe('POST')
    call.flush(null, { status: 204, statusText: 'No Content' })
    await expect(result).resolves.toBeUndefined()
  })

  it('requests a code for a target and a purpose', async () => {
    const result = service.requestOtp({ target: TARGET, purpose: 'verify' })
    const call = await request('/api/auth/otp')
    expect(call.request.body).toEqual({ target: TARGET, purpose: 'verify' })
    call.flush({}, { status: 202, statusText: 'Accepted' })
    await result
  })

  it('verifies a code and returns the verified account', async () => {
    const result = service.verifyOtp({ target: TARGET, purpose: 'verify', code: '123456' })
    const call = await request('/api/auth/otp/verification')
    expect(call.request.body).toEqual({ target: TARGET, purpose: 'verify', code: '123456' })
    call.flush({ user: USER })
    expect(await result).toEqual({ user: USER })
  })

  it('rejects with the ApiError the error interceptor built', async () => {
    const result = service.login(CREDENTIALS)
    const call = await request('/api/auth/login')
    call.flush(
      { error: { code: 'unauthenticated', message: 'x' }, requestId: 'r' },
      { status: 401, statusText: 'Unauthorized' },
    )
    const error: unknown = await result.catch((cause: unknown) => cause)
    expect(isApiError(error) && error.code).toBe('unauthenticated')
  })
})
