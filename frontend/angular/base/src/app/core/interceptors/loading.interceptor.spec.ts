import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'

import { BACKGROUND } from '../config/http-context'
import { LoadingService } from '../providers/loading.service'
import { loadingInterceptor } from './loading.interceptor'

describe('loadingInterceptor', () => {
  let client: HttpClient
  let http: HttpTestingController
  let loading: LoadingService

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([loadingInterceptor])),
        provideHttpClientTesting(),
      ],
    })
    client = TestBed.inject(HttpClient)
    http = TestBed.inject(HttpTestingController)
    loading = TestBed.inject(LoadingService)
  })

  it('counts requests up while in flight and down as each one settles', () => {
    client.get('/a').subscribe()
    client.get('/b').subscribe({ error: () => undefined })
    expect(loading.busy()).toBe(true)
    http.expectOne('/a').flush({})
    expect(loading.busy()).toBe(true)
    http.expectOne('/b').flush('x', { status: 500, statusText: 'Server Error' })
    expect(loading.busy()).toBe(false)
  })

  it('stops counting when the caller cancels', () => {
    const subscription = client.get('/a').subscribe()
    expect(loading.busy()).toBe(true)
    subscription.unsubscribe()
    expect(loading.busy()).toBe(false)
    expect(http.expectOne('/a').cancelled).toBe(true)
  })

  it('skips a background request', () => {
    client.get('/poll', { context: new HttpContext().set(BACKGROUND, true) }).subscribe()
    expect(loading.busy()).toBe(false)
    http.expectOne('/poll').flush({})
    expect(loading.busy()).toBe(false)
  })
})
