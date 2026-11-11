import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'

import { LoggerService } from '@app/core/providers/logger.service'
import { NetworkService } from '@app/core/providers/network.service'
import { NotificationService } from '@app/core/providers/notification.service'
import { ApiError } from '@app/services/api-error'
import type { PublicUser } from '@app/models/user/type'
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

describe('UserStore', () => {
  const service = { me: vi.fn(), update: vi.fn() }
  const showError = vi.fn<(key: string) => number>(() => 1)
  const online = signal(true)
  const signedIn = signal(true)

  beforeEach(() => {
    online.set(true)
    signedIn.set(true)
    service.me.mockReset()
    service.update.mockReset()
    showError.mockClear()
    TestBed.configureTestingModule({
      providers: [
        { provide: UserService, useValue: service },
        { provide: NotificationService, useValue: { showError } },
        { provide: LoggerService, useValue: { error: vi.fn() } },
        { provide: NetworkService, useValue: { online } },
        { provide: AuthStore, useValue: { isLoggedIn: signedIn } },
      ],
    })
  })

  it('loads the profile', async () => {
    service.me.mockResolvedValue(USER)
    const store = TestBed.inject(UserStore)
    const pending = store.load()
    expect(store.loading()).toBe(true)
    await pending
    expect(store.profile()).toEqual(USER)
    expect(store.loaded()).toBe(true)
  })

  it('records a failed load and toasts its copy once', async () => {
    service.me.mockRejectedValue(new ApiError({ status: 0, code: 'network' }))
    const store = TestBed.inject(UserStore)
    await store.load()
    expect(store.failed()).toBe(true)
    expect(showError).toHaveBeenCalledTimes(1)
    expect(showError).toHaveBeenCalledWith('errors.network')
  })

  it('saves the phone number and keeps the answer as the profile', async () => {
    const saved = { ...USER, phone: '+14155550132' }
    service.update.mockResolvedValue(saved)
    const store = TestBed.inject(UserStore)
    expect(await store.update({ phone: '+14155550132' })).toBe(true)
    expect(service.update).toHaveBeenCalledWith({ phone: '+14155550132' })
    expect(store.profile()).toEqual(saved)
  })

  it('leaves a validation failure for the page without a toast', async () => {
    service.update.mockRejectedValue(new ApiError({ status: 400, code: 'validation_failed' }))
    const store = TestBed.inject(UserStore)
    expect(await store.update({ phone: 'x' })).toBe(false)
    expect(store.error()?.code).toBe('validation_failed')
    expect(showError).not.toHaveBeenCalled()
  })

  it('does not send a change while offline', async () => {
    online.set(false)
    const store = TestBed.inject(UserStore)
    expect(await store.update({ phone: null })).toBe(false)
    expect(service.update).not.toHaveBeenCalled()
    expect(showError).toHaveBeenCalledWith('errors.offline')
  })

  describe('account scope', () => {
    it('clears the profile when nobody is signed in any more (sign-out, refused refresh)', async () => {
      service.me.mockResolvedValue(USER)
      const store = TestBed.inject(UserStore)
      await store.load()
      TestBed.tick()
      expect(store.profile()).toEqual(USER)
      signedIn.set(false)
      TestBed.tick()
      expect(store.profile()).toBeNull()
      expect(store.loaded()).toBe(false)
    })

    it('drops the previous profile when a load starts and when it fails', async () => {
      service.me.mockResolvedValueOnce(USER)
      const store = TestBed.inject(UserStore)
      await store.load()
      service.me.mockRejectedValueOnce(new ApiError({ status: 0, code: 'network' }))
      await store.load()
      expect(store.profile()).toBeNull()
      expect(store.failed()).toBe(true)
    })

    it('ignores an answer that arrives after sign-out', async () => {
      let answer: (user: PublicUser) => void = () => undefined
      service.me.mockReturnValue(new Promise<PublicUser>((resolve) => (answer = resolve)))
      const store = TestBed.inject(UserStore)
      const pending = store.load()
      signedIn.set(false)
      answer(USER)
      await pending
      expect(store.profile()).toBeNull()
    })
  })
})
