import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'

import { ApiError } from '@app/services/api-error'

import { errorInterceptor } from './error.interceptor'

describe('errorInterceptor', () => {
  let client: HttpClient
  let http: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    })
    client = TestBed.inject(HttpClient)
    http = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    http.verify()
  })

  function failure(respond: (request: ReturnType<HttpTestingController['expectOne']>) => void) {
    let error: unknown
    client.get('/api/x').subscribe({
      error: (e: unknown) => {
        error = e
      },
    })
    respond(http.expectOne('/api/x'))
    return error
  }

  it('maps the envelope to an ApiError with status, code and request id', () => {
    const error = failure((request) => {
      request.flush(
        { error: { code: 'not_found', message: 'no such plant' }, requestId: 'req-9' },
        { status: 404, statusText: 'Not Found' },
      )
    })
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, code: 'not_found', requestId: 'req-9' })
  })

  it('reads the request id from the x-request-id header when the body has none', () => {
    const error = failure((request) => {
      request.flush('<html>gateway</html>', {
        status: 502,
        statusText: 'Bad Gateway',
        headers: { 'x-request-id': 'hdr-1' },
      })
    })
    expect(error).toMatchObject({ status: 502, code: 'unknown', requestId: 'hdr-1' })
  })

  it('maps the details of a validation failure to field errors without the server text', () => {
    const error = failure((request) => {
      request.flush(
        {
          error: {
            code: 'validation_failed',
            message: 'invalid body',
            details: [
              { path: 'email', message: 'server words for email' },
              { path: '__proto__', message: 'x' },
              { path: 'address.city', message: 'y' },
            ],
          },
          requestId: 'r',
        },
        { status: 400, statusText: 'Bad Request' },
      )
    })
    expect(error).toMatchObject({
      code: 'validation_failed',
      fieldErrors: { email: ['invalid'], 'address.city': ['invalid'] },
    })
    expect((error as ApiError).fieldErrors).not.toHaveProperty('__proto__', ['invalid'])
  })

  it('maps a status 0 failure to the network code', () => {
    const error = failure((request) => {
      request.error(new ProgressEvent('error'))
    })
    expect(error).toMatchObject({ status: 0, code: 'network' })
  })

  it('maps an envelope with a code the table lacks to unknown', () => {
    const error = failure((request) => {
      request.flush(
        { error: { code: 'teapot', message: 'm' }, requestId: 'r' },
        { status: 418, statusText: 'Teapot' },
      )
    })
    expect(error).toMatchObject({ status: 418, code: 'unknown' })
  })

  it('never keeps the server message', () => {
    const error = failure((request) => {
      request.flush(
        { error: { code: 'forbidden', message: 'SERVER-ONLY-TEXT' }, requestId: 'r' },
        { status: 403, statusText: 'Forbidden' },
      )
    }) as ApiError
    expect(error.message).not.toContain('SERVER-ONLY-TEXT')
    expect(JSON.stringify(error)).not.toContain('SERVER-ONLY-TEXT')
  })

  it('passes a success through untouched', () => {
    let body: unknown
    client.get('/api/x').subscribe((value) => {
      body = value
    })
    http.expectOne('/api/x').flush({ ok: true })
    expect(body).toEqual({ ok: true })
  })
})
