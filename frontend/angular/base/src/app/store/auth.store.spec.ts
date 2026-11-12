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
import { SessionStore } from './session.store'
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
    signup: vi.fn(),
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
      expect((await store.login(CREDENTIALS)).ok).toBe(true)
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
      expect((await store.login(CREDENTIALS)).ok).toBe(false)
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
      const result = await store.login(CREDENTIALS)
      expect(result.ok).toBe(false)
      expect(!result.ok && result.error?.code).toBe('validation_failed')
      expect(store.error('login')?.code).toBe('validation_failed')
      expect(showError).not.toHaveBeenCalled()
    })

    it('logs a cause that is not an ApiError and shows errors.unknown', async () => {
      auth.login.mockRejectedValue(new TypeError('boom'))
      const store = TestBed.inject(AuthStore)
      expect((await store.login(CREDENTIALS)).ok).toBe(false)
      expect(logError).toHaveBeenCalledTimes(1)
      expect(showError).toHaveBeenCalledWith('errors.unknown')
    })

    it('does not send while offline', async () => {
      online.set(false)
      const store = TestBed.inject(AuthStore)
      expect((await store.login(CREDENTIALS)).ok).toBe(false)
      expect(auth.login).not.toHaveBeenCalled()
      expect(showError).toHaveBeenCalledWith('errors.offline')
    })
  })

  describe('signup', () => {
    it('signs the new account in', async () => {
      auth.signup.mockResolvedValue({ user: USER, tokens: {} })
      const store = TestBed.inject(AuthStore)
      expect((await store.signup(CREDENTIALS)).ok).toBe(true)
      expect(store.user()).toEqual(USER)
      expect(hint()).toBe('1')
    })

    it('toasts the taken address on a conflict', async () => {
      auth.signup.mockRejectedValue(api(409, 'conflict'))
      const store = TestBed.inject(AuthStore)
      expect((await store.signup(CREDENTIALS)).ok).toBe(false)
      expect(showError).toHaveBeenCalledWith('auth.signup.conflict')
    })
  })

  describe('logout', () => {
    it('clears the account and the hint and goes home', async () => {
      auth.login.mockResolvedValue({ user: USER, tokens: {} })
      auth.logout.mockResolvedValue(undefined)
      const store = TestBed.inject(AuthStore)
      await store.login(CREDENTIALS)
      expect((await store.logout()).ok).toBe(true)
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
      expect((await store.logout()).ok).toBe(true)
      expect(hint()).toBeNull()
      expect(showError).not.toHaveBeenCalled()
    })

    it('keeps the account on screen when the server fails, with one toast', async () => {
      auth.login.mockResolvedValue({ user: USER, tokens: {} })
      auth.logout.mockRejectedValue(api(503, 'upstream_unavailable'))
      const store = TestBed.inject(AuthStore)
      await store.login(CREDENTIALS)
      expect((await store.logout()).ok).toBe(false)
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

  describe('a session ended elsewhere', () => {
    it('forgets the account when the session ends (a refused refresh)', async () => {
      auth.login.mockResolvedValue({ user: USER, tokens: {} })
      const store = TestBed.inject(AuthStore)
      await store.login(CREDENTIALS)
      TestBed.inject(SessionStore).end()
      expect(store.user()).toBeNull()
      expect(store.isLoggedIn()).toBe(false)
      expect(store.roles()).toEqual([])
    })
  })

  describe('one call does not block another', () => {
    it('keeps a status per call: a code request in flight leaves verify idle', async () => {
      auth.login.mockResolvedValue({ user: USER, tokens: {} })
      auth.requestOtp.mockReturnValue(new Promise(() => undefined))
      const store = TestBed.inject(AuthStore)
      await store.login(CREDENTIALS)
      void store.requestOtp()
      expect(store.loading('requestOtp')).toBe(true)
      expect(store.loading('verifyOtp')).toBe(false)
    })
  })

  describe('one-time code', () => {
    it('asks for a code for the signed-in address', async () => {
      auth.login.mockResolvedValue({ user: USER, tokens: {} })
      auth.requestOtp.mockResolvedValue(undefined)
      const store = TestBed.inject(AuthStore)
      await store.login(CREDENTIALS)
      expect((await store.requestOtp()).ok).toBe(true)
      expect(auth.requestOtp).toHaveBeenCalledWith({
        target: { type: 'email', value: USER.email },
        purpose: 'verify',
      })
    })

    it('does nothing without an account', async () => {
      const store = TestBed.inject(AuthStore)
      expect(await store.requestOtp()).toEqual({ ok: false, error: null })
      expect(await store.verifyOtp('123456')).toEqual({ ok: false, error: null })
      expect(auth.requestOtp).not.toHaveBeenCalled()
      expect(auth.verifyOtp).not.toHaveBeenCalled()
    })

    it('stores the verified account', async () => {
      auth.login.mockResolvedValue({ user: USER, tokens: {} })
      const verified = { ...USER, emailVerifiedAt: '2026-11-02T00:00:00.000Z' }
      auth.verifyOtp.mockResolvedValue({ user: verified })
      const store = TestBed.inject(AuthStore)
      await store.login(CREDENTIALS)
      expect((await store.verifyOtp('123456')).ok).toBe(true)
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
      expect((await store.verifyOtp('000000')).ok).toBe(false)
      expect(showError).toHaveBeenCalledTimes(1)
      expect(showError).toHaveBeenCalledWith('errors.rate_limited')
      expect(store.isLoggedIn()).toBe(true)
    })
  })
  describe('restoreSession through the real HTTP chain', () => {
    const UNAUTH = { error: { code: 'unauthenticated', message: 'x' }, requestId: 'r' }
    const REFUSED = { status: 401, statusText: 'Unauthorized' }
    // A 401 of the access-token gate: the challenge a refresh can answer.
    const CHALLENGED = { ...REFUSED, headers: { 'WWW-Authenticate': 'Bearer' } }

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
      // The hint is in storage before start-up: the session store reads it once.
      setHint()
      const store = TestBed.inject(AuthStore)
      const probe = store.restoreSession()
      expect(store.restoring()).toBe(true)

      const path = (name: string) => (req: { url: string }) => new URL(req.url).pathname === name
      await vi.waitFor(() => {
        expect(
          http.match(path('/api/user/me')).map((r) => {
            r.flush(UNAUTH, CHALLENGED)
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
      // The hint is in storage before start-up: the session store reads it once.
      setHint()
      const store = TestBed.inject(AuthStore)
      const probe = store.restoreSession()

      const path = (name: string) => (req: { url: string }) => new URL(req.url).pathname === name
      await vi.waitFor(() => {
        expect(
          http.match(path('/api/user/me')).map((r) => {
            r.flush(UNAUTH, CHALLENGED)
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
      await TestBed.inject(SessionStore).refresh()
      TestBed.tick()
      expect(profiles.profile()).toBeNull()
    })
  })
})
