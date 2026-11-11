import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing'
import { HttpClient } from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import { Component } from '@angular/core'
import { Router, provideRouter } from '@angular/router'
import { firstValueFrom } from 'rxjs'

import { provideApiClient } from '@app/core/config/api-client.provider'
import { STORAGE_KEYS } from '@app/core/config/constants'
import { StorageService } from '@app/core/providers/storage.service'
import { isApiError } from '@app/services/api-error'
import { AuthStore } from '@app/store/auth.store'
import { AuthService } from '@app/services/auth.service'
import { UserService } from '@app/services/user.service'

import { provideHttp } from './http.provider'

const UNAUTHENTICATED = { error: { code: 'unauthenticated', message: 'x' }, requestId: 'r' }
const UNAUTHORIZED = { status: 401, statusText: 'Unauthorized' }
const ME = {
  id: 'u1',
  email: 'ada@example.com',
  role: 'user',
  phone: null,
  emailVerifiedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
}
const CREDENTIALS = { email: 'ada@example.com', password: 'longenough1' }

@Component({ template: '' })
class PageComponent {}

const pathOf = (url: string) => new URL(url).pathname

// The real chain (loading, error, auth) over HttpTestingController. The generated client sends its
// request after an internal await, so every lookup waits for the request to appear.
describe('authInterceptor', () => {
  let http: HttpTestingController

  async function take(path: string, count = 1): Promise<TestRequest[]> {
    const found: TestRequest[] = []
    await vi.waitFor(() => {
      found.push(...http.match((req) => pathOf(req.url) === path))
      expect(found.length).toBeGreaterThanOrEqual(count)
    })
    return found
  }

  function expectNoRequest(path: string) {
    expect(http.match((req) => pathOf(req.url) === path)).toHaveLength(0)
  }

  const hintSet = () => TestBed.inject(StorageService).get(STORAGE_KEYS.session) === '1'

  beforeEach(() => {
    localStorage.clear()
    TestBed.configureTestingModule({
      providers: [
        provideHttp(),
        provideHttpClientTesting(),
        provideApiClient(),
        provideRouter([
          { path: 'profile', component: PageComponent },
          { path: 'auth/login', component: PageComponent },
          { path: 'public', component: PageComponent },
        ]),
      ],
    })
    http = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    http.verify()
    localStorage.clear()
  })

  describe('with a session hint', () => {
    beforeEach(() => {
      TestBed.inject(StorageService).set(STORAGE_KEYS.session, '1')
    })

    it('collapses two concurrent 401s into one refresh and replays both requests once', async () => {
      const users = TestBed.inject(UserService)
      const first = users.me()
      const second = users.me()

      const attempts = await take('/api/user/me', 2)
      for (const attempt of attempts) attempt.flush(UNAUTHENTICATED, UNAUTHORIZED)

      const refreshes = await take('/api/auth/refresh')
      expect(refreshes).toHaveLength(1)
      expect(refreshes[0].request.method).toBe('POST')
      refreshes[0].flush({})

      const replays = await take('/api/user/me', 2)
      expect(replays).toHaveLength(2)
      for (const replay of replays) replay.flush(ME)

      await expect(Promise.all([first, second])).resolves.toEqual([ME, ME])
      expectNoRequest('/api/auth/refresh')
    })

    it('replays the request only once: a second 401 reaches the caller', async () => {
      const result = TestBed.inject(UserService).me()
      ;(await take('/api/user/me'))[0].flush(UNAUTHENTICATED, UNAUTHORIZED)
      ;(await take('/api/auth/refresh'))[0].flush({})
      ;(await take('/api/user/me'))[0].flush(UNAUTHENTICATED, UNAUTHORIZED)

      const error: unknown = await result.catch((cause: unknown) => cause)
      expect(isApiError(error) && error.code).toBe('unauthenticated')
      expectNoRequest('/api/auth/refresh')
    })

    it('returns the original 401 as an ApiError when the refresh is refused, and forgets the hint', async () => {
      const result = TestBed.inject(UserService).me()
      ;(await take('/api/user/me'))[0].flush(UNAUTHENTICATED, UNAUTHORIZED)
      ;(await take('/api/auth/refresh'))[0].flush(UNAUTHENTICATED, UNAUTHORIZED)

      const error: unknown = await result.catch((cause: unknown) => cause)
      expect(isApiError(error) && error.code).toBe('unauthenticated')
      expect(hintSet()).toBe(false)
      expectNoRequest('/api/user/me')
    })

    it('sends the visitor to login with the current page as next when the refresh is refused', async () => {
      const router = TestBed.inject(Router)
      await router.navigateByUrl('/profile?tab=2')
      const result = TestBed.inject(UserService).me()
      ;(await take('/api/user/me'))[0].flush(UNAUTHENTICATED, UNAUTHORIZED)
      ;(await take('/api/auth/refresh'))[0].flush(UNAUTHENTICATED, UNAUTHORIZED)
      await result.catch(() => undefined)
      await vi.waitFor(() => {
        expect(router.url).toBe('/auth/login?next=%2Fprofile%3Ftab%3D2')
      })
    })

    it('does not navigate when the refresh only failed on the network (the session may be fine)', async () => {
      const router = TestBed.inject(Router)
      await router.navigateByUrl('/profile')
      const result = TestBed.inject(UserService).me()
      ;(await take('/api/user/me'))[0].flush(UNAUTHENTICATED, UNAUTHORIZED)
      ;(await take('/api/auth/refresh'))[0].error(new ProgressEvent('error'))
      await result.catch(() => undefined)
      expect(router.url).toBe('/profile')
    })

    it('does not navigate while the start-up probe runs', async () => {
      const router = TestBed.inject(Router)
      await router.navigateByUrl('/public')
      const probe = TestBed.inject(AuthStore).restoreSession()
      ;(await take('/api/user/me'))[0].flush(UNAUTHENTICATED, UNAUTHORIZED)
      ;(await take('/api/auth/refresh'))[0].flush(UNAUTHENTICATED, UNAUTHORIZED)
      await probe
      expect(router.url).toBe('/public')
    })

    it('keeps the hint and the original error when the refresh cannot reach the server', async () => {
      const result = TestBed.inject(UserService).me()
      ;(await take('/api/user/me'))[0].flush(UNAUTHENTICATED, UNAUTHORIZED)
      ;(await take('/api/auth/refresh'))[0].error(new ProgressEvent('error'))

      const error: unknown = await result.catch((cause: unknown) => cause)
      expect(isApiError(error) && error.code).toBe('unauthenticated')
      expect(hintSet()).toBe(true)
    })

    it('refreshes for sign-out, which needs a live session to revoke', async () => {
      const result = TestBed.inject(AuthService).logout()
      ;(await take('/api/auth/logout'))[0].flush(UNAUTHENTICATED, UNAUTHORIZED)
      ;(await take('/api/auth/refresh'))[0].flush({})
      ;(await take('/api/auth/logout'))[0].flush(null, { status: 204, statusText: 'No Content' })
      await result
    })

    it.each([
      ['sign-in', '/api/auth/login', (auth: AuthService) => auth.login(CREDENTIALS)],
      ['sign-up', '/api/auth/register', (auth: AuthService) => auth.register(CREDENTIALS)],
      ['the refresh itself', '/api/auth/refresh', (auth: AuthService) => auth.refresh()],
      [
        'an OTP request',
        '/api/auth/otp',
        (auth: AuthService) =>
          auth.requestOtp({ target: { type: 'email', value: 'a@example.com' }, purpose: 'verify' }),
      ],
      [
        'an OTP verification',
        '/api/auth/otp/verification',
        (auth: AuthService) =>
          auth.verifyOtp({
            target: { type: 'email', value: 'a@example.com' },
            purpose: 'verify',
            code: '123456',
          }),
      ],
    ])('never refreshes after a 401 from %s', async (_name, path, send) => {
      const result = send(TestBed.inject(AuthService))
      ;(await take(path))[0].flush(UNAUTHENTICATED, UNAUTHORIZED)

      const error: unknown = await result.catch((cause: unknown) => cause)
      expect(isApiError(error) && error.code).toBe('unauthenticated')
      expectNoRequest('/api/auth/refresh')
    })

    it('does not refresh for a failure that is not a 401', async () => {
      const result = TestBed.inject(UserService).me()
      ;(await take('/api/user/me'))[0].flush(
        { error: { code: 'forbidden', message: 'x' }, requestId: 'r' },
        { status: 403, statusText: 'Forbidden' },
      )
      const error: unknown = await result.catch((cause: unknown) => cause)
      expect(isApiError(error) && error.code).toBe('forbidden')
      expectNoRequest('/api/auth/refresh')
    })
  })

  describe('without a session hint', () => {
    it('does not refresh: a visitor 401 goes straight to the caller', async () => {
      const result = TestBed.inject(UserService).me()
      ;(await take('/api/user/me'))[0].flush(UNAUTHENTICATED, UNAUTHORIZED)

      const error: unknown = await result.catch((cause: unknown) => cause)
      expect(isApiError(error) && error.code).toBe('unauthenticated')
      expectNoRequest('/api/auth/refresh')
    })
  })

  it('sends the cookies on every request', async () => {
    const result = TestBed.inject(UserService).me()
    const [request] = await take('/api/user/me')
    expect(request.request.withCredentials).toBe(true)
    request.flush(ME)
    await result
  })

  describe('outside the app API', () => {
    it('leaves a third-party URL alone: no cookies, no refresh after its 401', async () => {
      TestBed.inject(StorageService).set(STORAGE_KEYS.session, '1')
      const result = firstValueFrom(
        TestBed.inject(HttpClient).get('https://other.example/api/thing'),
      )
      const request = http.expectOne('https://other.example/api/thing')
      expect(request.request.withCredentials).toBe(false)
      request.flush(null, UNAUTHORIZED)
      await expect(result).rejects.toBeDefined()
      expectNoRequest('/api/auth/refresh')
    })

    it('leaves a same-origin URL outside /api alone', async () => {
      const result = firstValueFrom(TestBed.inject(HttpClient).get('/assets/data.json'))
      const request = http.expectOne('/assets/data.json')
      expect(request.request.withCredentials).toBe(false)
      request.flush({})
      await result
    })
  })
})
