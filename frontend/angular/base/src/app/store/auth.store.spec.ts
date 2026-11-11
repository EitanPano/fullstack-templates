import { signal } from '@angular/core'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'

import { provideApiClient } from '@app/core/config/api-client.provider'
import { provideHttp } from '@app/core/interceptors/http.provider'
import { STORAGE_KEYS } from '@app/core/config/constants'
import { LoggerService } from '@app/core/providers/logger.service'
import { NetworkService } from '@app/core/providers/network.service'
import { NotificationService } from '@app/core/providers/notification.service'
import { StorageService } from '@app/core/providers/storage.service'
import { ApiError } from '@app/services/api-error'
import type { PublicUser } from '@app/models/user/type'
import { AuthService } from '@app/services/auth.service'
import { UserService } from '@app/services/user.service'

import { AuthStore } from './auth.store'
import { UserStore } from './user.store'

const USER: PublicUser = {
  id: '1',
  email: 'ada@example.com',
  phone: null,
  role: 'user',
  status: 'active',
  emailVerifiedAt: null,
  phoneVerifiedAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
}
const CREDENTIALS = { email: USER.email, password: 'longenough1' }
const api = (status: number, code: ApiError['code']) => new ApiError({ status, code })

describe('AuthStore', () => {
  const auth = {
    login: vi.fn(),
    register: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    requestOtp: vi.fn(),
    verifyOtp: vi.fn(),
  }
  const users = { me: vi.fn() }
  const showError = vi.fn<(key: string) => number>(() => 1)
  const logError = vi.fn<(message: string, ...details: unknown[]) => void>()
  const navigateByUrl = vi.fn<(url: string) => Promise<boolean>>(() => Promise.resolve(true))
  const online = signal(true)

  const hint = () => TestBed.inject(StorageService).get(STORAGE_KEYS.session)
  const setHint = () => TestBed.inject(StorageService).set(STORAGE_KEYS.session, '1')

  beforeEach(() => {
    localStorage.clear()
    online.set(true)
    for (const fn of [...Object.values(auth), users.me, showError, logError, navigateByUrl]) {
      fn.mockClear()
    }
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: UserService, useValue: users },
        { provide: NotificationService, useValue: { showError } },
        { provide: LoggerService, useValue: { error: logError } },
        { provide: NetworkService, useValue: { online } },
        { provide: Router, useValue: { navigateByUrl } },
      ],
    })
  })

  describe('login', () => {
    it('sets the account and the session hint', async () => {
      auth.login.mockResolvedValue({ user: USER, tokens: {} })
      const store = TestBed.inject(AuthStore)
      expect(await store.login(CREDENTIALS)).toBe(true)
      expect(auth.login).toHaveBeenCalledWith(CREDENTIALS)
      expect(store.user()).toEqual(USER)
      expect(store.isLoggedIn()).toBe(true)
      expect(store.roles()).toEqual(['user'])
      expect(hint()).toBe('1')
      expect(showError).not.toHaveBeenCalled()
    })

    it('toasts wrong credentials once and stays signed out', async () => {
      auth.login.mockRejectedValue(api(401, 'unauthenticated'))
      const store = TestBed.inject(AuthStore)
      expect(await store.login(CREDENTIALS)).toBe(false)
      expect(store.user()).toBeNull()
      expect(hint()).toBeNull()
      expect(showError).toHaveBeenCalledTimes(1)
      expect(showError).toHaveBeenCalledWith('auth.login.invalid')
    })

    it('leaves a validation failure in the store for the page and does not toast it', async () => {
      auth.login.mockRejectedValue(
        new ApiError({
          status: 400,
          code: 'validation_failed',
          fieldErrors: { email: ['invalid'] },
        }),
      )
      const store = TestBed.inject(AuthStore)
      expect(await store.login(CREDENTIALS)).toBe(false)
      expect(store.error()?.code).toBe('validation_failed')
      expect(showError).not.toHaveBeenCalled()
    })

    it('logs a cause that is not an ApiError and shows errors.unknown', async () => {
      auth.login.mockRejectedValue(new TypeError('boom'))
      const store = TestBed.inject(AuthStore)
      expect(await store.login(CREDENTIALS)).toBe(false)
      expect(logError).toHaveBeenCalledTimes(1)
      expect(showError).toHaveBeenCalledWith('errors.unknown')
    })

    it('does not send while offline', async () => {
      online.set(false)
      const store = TestBed.inject(AuthStore)
      expect(await store.login(CREDENTIALS)).toBe(false)
      expect(auth.login).not.toHaveBeenCalled()
      expect(showError).toHaveBeenCalledWith('errors.offline')
    })
  })

  describe('register', () => {
    it('signs the new account in', async () => {
      auth.register.mockResolvedValue({ user: USER, tokens: {} })
      const store = TestBed.inject(AuthStore)
      expect(await store.register(CREDENTIALS)).toBe(true)
      expect(store.user()).toEqual(USER)
      expect(hint()).toBe('1')
    })

    it('toasts the taken address on a conflict', async () => {
      auth.register.mockRejectedValue(api(409, 'conflict'))
      const store = TestBed.inject(AuthStore)
      expect(await store.register(CREDENTIALS)).toBe(false)
      expect(showError).toHaveBeenCalledWith('auth.register.conflict')
    })
  })

  describe('logout', () => {
    it('clears the account and the hint and goes home', async () => {
      auth.login.mockResolvedValue({ user: USER, tokens: {} })
      auth.logout.mockResolvedValue(undefined)
      const store = TestBed.inject(AuthStore)
      await store.login(CREDENTIALS)
      expect(await store.logout()).toBe(true)
      expect(store.user()).toBeNull()
      expect(store.isLoggedIn()).toBe(false)
      expect(store.roles()).toEqual([])
      expect(hint()).toBeNull()
      expect(navigateByUrl).toHaveBeenCalledWith('/')
    })

    it('signs out locally when the session was already gone (401)', async () => {
      auth.logout.mockRejectedValue(api(401, 'unauthenticated'))
      setHint()
      const store = TestBed.inject(AuthStore)
      expect(await store.logout()).toBe(true)
      expect(hint()).toBeNull()
      expect(showError).not.toHaveBeenCalled()
    })

    it('keeps the account on screen when the server fails, with one toast', async () => {
      auth.login.mockResolvedValue({ user: USER, tokens: {} })
      auth.logout.mockRejectedValue(api(503, 'upstream_unavailable'))
      const store = TestBed.inject(AuthStore)
      await store.login(CREDENTIALS)
      expect(await store.logout()).toBe(false)
      expect(store.isLoggedIn()).toBe(true)
      expect(hint()).toBe('1')
      expect(showError).toHaveBeenCalledWith('errors.upstream_unavailable')
      expect(navigateByUrl).not.toHaveBeenCalled()
    })
  })

  describe('restoreSession', () => {
    it('calls nothing without the hint', async () => {
      const store = TestBed.inject(AuthStore)
      await store.restoreSession()
      expect(users.me).not.toHaveBeenCalled()
      expect(store.user()).toBeNull()
    })

    it('reads the account when the hint is set', async () => {
      setHint()
      users.me.mockResolvedValue(USER)
      const store = TestBed.inject(AuthStore)
      await store.restoreSession()
      expect(store.user()).toEqual(USER)
      expect(hint()).toBe('1')
    })

    it('leaves the visitor signed out on a 401 and never clears the hint itself', async () => {
      setHint()
      users.me.mockRejectedValue(api(401, 'unauthenticated'))
      const store = TestBed.inject(AuthStore)
      await store.restoreSession()
      expect(store.user()).toBeNull()
      expect(hint()).toBe('1')
      expect(logError).not.toHaveBeenCalled()
    })

    it('fails closed on any other failure: logs, signed out, hint kept', async () => {
      setHint()
      users.me.mockRejectedValue(api(503, 'upstream_unavailable'))
      const store = TestBed.inject(AuthStore)
      await store.restoreSession()
      expect(store.user()).toBeNull()
      expect(hint()).toBe('1')
      expect(logError).toHaveBeenCalledTimes(1)
      expect(showError).not.toHaveBeenCalled()
    })
  })

  describe('refresh failures', () => {
    it('logs a refresh that failed for a reason other than a refusal', async () => {
      auth.refresh.mockRejectedValue(api(503, 'upstream_unavailable'))
      setHint()
      expect(await TestBed.inject(AuthStore).refresh()).toBe(false)
      expect(logError).toHaveBeenCalledTimes(1)
      expect(hint()).toBe('1')
    })

    it('does not log a refusal', async () => {
      auth.refresh.mockRejectedValue(api(401, 'unauthenticated'))
      await TestBed.inject(AuthStore).refresh()
      expect(logError).not.toHaveBeenCalled()
    })
  })

  describe('refresh', () => {
    it('resolves true when the cookies are renewed', async () => {
      auth.refresh.mockResolvedValue({ user: USER, tokens: {} })
      setHint()
      expect(await TestBed.inject(AuthStore).refresh()).toBe(true)
      expect(hint()).toBe('1')
    })

    it.each([400, 401, 403])(
      'a %i ends the session: false, hint and account forgotten',
      async (status) => {
        auth.login.mockResolvedValue({ user: USER, tokens: {} })
        auth.refresh.mockRejectedValue(api(status, 'unauthenticated'))
        const store = TestBed.inject(AuthStore)
        await store.login(CREDENTIALS)
        expect(await store.refresh()).toBe(false)
        expect(hint()).toBeNull()
        expect(store.user()).toBeNull()
      },
    )

    it.each([
      ['a 500', api(500, 'internal')],
      ['a rate limit', api(429, 'rate_limited')],
      ['no response', api(0, 'network')],
    ])('%s says nothing about the cookies: false, hint kept', async (_what, error) => {
      auth.refresh.mockRejectedValue(error)
      setHint()
      expect(await TestBed.inject(AuthStore).refresh()).toBe(false)
      expect(hint()).toBe('1')
    })

    it('shares one in-flight refresh between concurrent callers', async () => {
      let finish: () => void = () => undefined
      auth.refresh.mockReturnValue(
        new Promise((resolve) => {
          finish = () => {
            resolve({ user: USER, tokens: {} })
          }
        }),
      )
      const store = TestBed.inject(AuthStore)
      const results = [store.refresh(), store.refresh(), store.refresh()]
      finish()
      expect(await Promise.all(results)).toEqual([true, true, true])
      expect(auth.refresh).toHaveBeenCalledTimes(1)
      auth.refresh.mockResolvedValue({ user: USER, tokens: {} })
      await store.refresh()
      expect(auth.refresh).toHaveBeenCalledTimes(2)
    })
  })

  describe('one-time code', () => {
    it('asks for a code for the signed-in address', async () => {
      auth.login.mockResolvedValue({ user: USER, tokens: {} })
      auth.requestOtp.mockResolvedValue(undefined)
      const store = TestBed.inject(AuthStore)
      await store.login(CREDENTIALS)
      expect(await store.requestOtp()).toBe(true)
      expect(auth.requestOtp).toHaveBeenCalledWith({
        target: { type: 'email', value: USER.email },
        purpose: 'verify',
      })
    })

    it('does nothing without an account', async () => {
      const store = TestBed.inject(AuthStore)
      expect(await store.requestOtp()).toBe(false)
      expect(await store.verifyOtp('123456')).toBe(false)
      expect(auth.requestOtp).not.toHaveBeenCalled()
      expect(auth.verifyOtp).not.toHaveBeenCalled()
    })

    it('stores the verified account', async () => {
      auth.login.mockResolvedValue({ user: USER, tokens: {} })
      const verified = { ...USER, emailVerifiedAt: '2026-11-02T00:00:00.000Z' }
      auth.verifyOtp.mockResolvedValue({ user: verified })
      const store = TestBed.inject(AuthStore)
      await store.login(CREDENTIALS)
      expect(await store.verifyOtp('123456')).toBe(true)
      expect(auth.verifyOtp).toHaveBeenCalledWith({
        target: { type: 'email', value: USER.email },
        purpose: 'verify',
        code: '123456',
      })
      expect(store.user()?.emailVerifiedAt).toBe(verified.emailVerifiedAt)
    })

    it('toasts a wrong code once and keeps the account', async () => {
      auth.login.mockResolvedValue({ user: USER, tokens: {} })
      auth.verifyOtp.mockRejectedValue(api(429, 'rate_limited'))
      const store = TestBed.inject(AuthStore)
      await store.login(CREDENTIALS)
      expect(await store.verifyOtp('000000')).toBe(false)
      expect(showError).toHaveBeenCalledTimes(1)
      expect(showError).toHaveBeenCalledWith('errors.rate_limited')
      expect(store.isLoggedIn()).toBe(true)
    })
  })
  describe('restoreSession through the real HTTP chain', () => {
    const UNAUTH = { error: { code: 'unauthenticated', message: 'x' }, requestId: 'r' }
    const REFUSED = { status: 401, statusText: 'Unauthorized' }

    it('handles a refused refresh: hint and account cleared, no redirect, no throw', async () => {
      TestBed.resetTestingModule()
      TestBed.configureTestingModule({
        providers: [
          provideHttp(),
          provideHttpClientTesting(),
          provideApiClient(),
          { provide: LoggerService, useValue: { error: logError } },
          { provide: Router, useValue: { navigateByUrl, url: '/public' } },
        ],
      })
      const http = TestBed.inject(HttpTestingController)
      const store = TestBed.inject(AuthStore)
      setHint()
      const probe = store.restoreSession()
      expect(store.restoring()).toBe(true)

      const path = (name: string) => (req: { url: string }) => new URL(req.url).pathname === name
      await vi.waitFor(() => {
        expect(
          http.match(path('/api/user/me')).map((r) => {
            r.flush(UNAUTH, REFUSED)
            return r
          }),
        ).toHaveLength(1)
      })
      await vi.waitFor(() => {
        expect(
          http.match(path('/api/auth/refresh')).map((r) => {
            r.flush(UNAUTH, REFUSED)
            return r
          }),
        ).toHaveLength(1)
      })
      await expect(probe).resolves.toBeUndefined()

      expect(store.user()).toBeNull()
      expect(store.isLoggedIn()).toBe(false)
      expect(store.restoring()).toBe(false)
      expect(hint()).toBeNull()
      expect(navigateByUrl).not.toHaveBeenCalled()
      expect(logError).not.toHaveBeenCalled()
      http.verify()
    })

    it('keeps the hint when the refresh behind a 401 failed on the network', async () => {
      TestBed.resetTestingModule()
      TestBed.configureTestingModule({
        providers: [
          provideHttp(),
          provideHttpClientTesting(),
          provideApiClient(),
          { provide: LoggerService, useValue: { error: logError } },
          { provide: Router, useValue: { navigateByUrl, url: '/public' } },
        ],
      })
      const http = TestBed.inject(HttpTestingController)
      const store = TestBed.inject(AuthStore)
      setHint()
      const probe = store.restoreSession()

      const path = (name: string) => (req: { url: string }) => new URL(req.url).pathname === name
      await vi.waitFor(() => {
        expect(
          http.match(path('/api/user/me')).map((r) => {
            r.flush(UNAUTH, REFUSED)
            return r
          }),
        ).toHaveLength(1)
      })
      await vi.waitFor(() => {
        expect(
          http.match(path('/api/auth/refresh')).map((r) => {
            r.error(new ProgressEvent('error'))
            return r
          }),
        ).toHaveLength(1)
      })
      await expect(probe).resolves.toBeUndefined()

      expect(store.user()).toBeNull()
      expect(hint()).toBe('1')
      http.verify()
    })

    it('clears the account profile when the session ends (sign-out and refused refresh)', async () => {
      TestBed.resetTestingModule()
      TestBed.configureTestingModule({
        providers: [
          { provide: AuthService, useValue: auth },
          { provide: UserService, useValue: { me: users.me, update: vi.fn() } },
          { provide: NotificationService, useValue: { showError } },
          { provide: LoggerService, useValue: { error: logError } },
          { provide: NetworkService, useValue: { online } },
          { provide: Router, useValue: { navigateByUrl } },
        ],
      })
      users.me.mockResolvedValue(USER)
      auth.login.mockResolvedValue({ user: USER, tokens: {} })
      auth.logout.mockResolvedValue(undefined)
      const store = TestBed.inject(AuthStore)
      const profiles = TestBed.inject(UserStore)

      await store.login(CREDENTIALS)
      await profiles.load()
      TestBed.tick()
      expect(profiles.profile()).toEqual(USER)
      await store.logout()
      TestBed.tick()
      expect(profiles.profile()).toBeNull()

      await store.login(CREDENTIALS)
      await profiles.load()
      TestBed.tick()
      expect(profiles.profile()).toEqual(USER)
      auth.refresh.mockRejectedValue(api(401, 'unauthenticated'))
      await store.refresh()
      TestBed.tick()
      expect(profiles.profile()).toBeNull()
    })
  })
})
