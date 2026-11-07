import { provideHttpClient, withInterceptors } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'

import { provideApiClient } from '@app/core/config/api-client.provider'
import { HTTP_INTERCEPTORS_IN_ORDER } from '@app/core/interceptors/http.provider'
import { isApiError } from '@app/models/api/response'

import { HealthService } from './health.service'

describe('HealthService', () => {
  let service: HealthService
  let http: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors(HTTP_INTERCEPTORS_IN_ORDER)),
        provideHttpClientTesting(),
        provideApiClient(),
      ],
    })
    service = TestBed.inject(HealthService)
    http = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    http.verify()
  })

  it('returns the data of the liveness call, sending credentials to /api/health', async () => {
    const result = service.get()
    // The generated client issues the request after one internal await.
    await Promise.resolve()
    const request = http.expectOne((req) => req.url.endsWith('/api/health'))
    expect(request.request.method).toBe('GET')
    expect(request.request.withCredentials).toBe(true)
    request.flush({ status: 'ok', uptimeSeconds: 12, version: '1.0.0' })
    expect(await result).toEqual({ status: 'ok', uptimeSeconds: 12, version: '1.0.0' })
  })

  it('returns the data of the readiness call', async () => {
    const result = service.ready()
    await Promise.resolve()
    http
      .expectOne((req) => req.url.endsWith('/api/health/ready'))
      .flush({ status: 'degraded', dependencies: { db: 'down' } })
    expect(await result).toEqual({ status: 'degraded', dependencies: { db: 'down' } })
  })

  it('rejects with the ApiError the error interceptor built', async () => {
    const result = service.get()
    await Promise.resolve()
    http
      .expectOne((req) => req.url.endsWith('/api/health'))
      .flush(
        { error: { code: 'internal', message: 'boom' }, requestId: 'r-1' },
        { status: 500, statusText: 'Server Error' },
      )
    const error: unknown = await result.catch((e: unknown) => e)
    expect(isApiError(error)).toBe(true)
    expect(error).toMatchObject({ status: 500, code: 'internal', requestId: 'r-1' })
  })
})
