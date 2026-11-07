import { provideHttpClient, withInterceptors } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'

import { provideApiClient } from '@app/core/config/api-client.provider'
import { errorInterceptor } from '@app/core/interceptors/error.interceptor'
import { isApiError } from '@app/models/api/response'

import { UserService } from './user.service'

const USER = { id: '1', email: 'ada@example.com', phone: null, role: 'user' }

describe('UserService', () => {
  let service: UserService
  let http: HttpTestingController

  async function request() {
    await Promise.resolve()
    return http.expectOne((req) => new URL(req.url).pathname === '/api/user/me')
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        provideApiClient(),
      ],
    })
    service = TestBed.inject(UserService)
    http = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    http.verify()
  })

  it('reads the signed-in account', async () => {
    const result = service.me()
    const call = await request()
    expect(call.request.method).toBe('GET')
    call.flush(USER)
    expect(await result).toEqual(USER)
  })

  it('changes the phone number with a PATCH and returns the account', async () => {
    const result = service.update({ phone: '+14155550132' })
    const call = await request()
    expect(call.request.method).toBe('PATCH')
    expect(call.request.body).toEqual({ phone: '+14155550132' })
    call.flush({ ...USER, phone: '+14155550132' })
    expect((await result).phone).toBe('+14155550132')
  })

  it('rejects with an ApiError when the session is gone', async () => {
    const result = service.me()
    const call = await request()
    call.flush(
      { error: { code: 'unauthenticated', message: 'x' }, requestId: 'r' },
      { status: 401, statusText: 'Unauthorized' },
    )
    const error: unknown = await result.catch((cause: unknown) => cause)
    expect(isApiError(error) && error.code).toBe('unauthenticated')
  })
})
