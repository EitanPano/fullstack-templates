import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'

import { provideTestTranslator } from '@app/core/i18n/translator.testing'
import { NotificationService } from '@app/core/providers/notification.service'
import type { Outcome } from '@app/models/api/type'
import { ApiError } from '@app/services/api-error'
import type { PublicUser } from '@app/models/user/type'
import { NOW } from '@app/shared/pipes/relative-time.pipe'
import { AuthStore } from '@app/store/auth.store'
import { UserStore } from '@app/store/user.store'

import { ProfileComponent } from './profile.component'

const PROFILE: PublicUser = {
  id: '1',
  email: 'ada@example.com',
  phone: '+14155550132',
  role: 'admin',
  status: 'active',
  emailVerifiedAt: null,
  phoneVerifiedAt: null,
  createdAt: '2026-11-03T10:00:00.000Z',
  updatedAt: '2026-11-03T10:00:00.000Z',
}

describe('ProfileComponent', () => {
  const profile = signal<PublicUser | null>(null)
  const status = signal<'idle' | 'loading' | 'loaded' | 'error'>('loading')
  const error = signal<ApiError | null>(null)
  const load = vi.fn<() => Promise<void>>(() => Promise.resolve())
  const update = vi.fn<(body: unknown) => Promise<Outcome<unknown>>>()
  const logout = vi.fn<() => Promise<Outcome<unknown>>>(() =>
    Promise.resolve({ ok: true as const, value: undefined }),
  )
  const showSuccess = vi.fn<(key: string) => number>(() => 1)
  const showError = vi.fn<(key: string) => number>(() => 1)

  async function render() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestTranslator(),
        { provide: NOW, useValue: () => new Date('2026-11-06T10:00:00.000Z') },
        {
          provide: UserStore,
          useValue: {
            profile,
            error: () => error(),
            load,
            update,
            loading: () => status() === 'loading',
            failed: () => status() === 'error',
          },
        },
        { provide: AuthStore, useValue: { logout } },
        { provide: NotificationService, useValue: { showSuccess, showError } },
      ],
    })
    const fixture = TestBed.createComponent(ProfileComponent)
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement
    const buttonByText = (text: string) =>
      Array.from(element.querySelectorAll('button')).find((node) => node.textContent.includes(text))
    return { fixture, element, buttonByText }
  }

  beforeEach(() => {
    profile.set(null)
    status.set('loading')
    error.set(null)
    for (const fn of [load, update, logout, showSuccess, showError]) fn.mockClear()
  })

  it('loads on open and shows a skeleton with a busy status while loading', async () => {
    const { element } = await render()
    expect(load).toHaveBeenCalledOnce()
    expect(element.querySelectorAll('h1')).toHaveLength(1)
    expect(element.querySelector('[role="status"][aria-busy="true"]')).not.toBeNull()
    expect(element.querySelector('dl')).toBeNull()
  })

  it('shows the email, the role label, when it was created and the verification state', async () => {
    status.set('loaded')
    profile.set(PROFILE)
    const { element } = await render()
    const text = element.querySelector('dl')?.textContent ?? ''
    expect(text).toContain('ada@example.com')
    expect(text).toContain('Administrator')
    expect(text).toContain('3 days ago')
    expect(text).toContain('Not verified')
    expect(element.querySelector('a[href="/auth/verify-otp"]')).not.toBeNull()
  })

  it('shows verified without the verify link', async () => {
    status.set('loaded')
    profile.set({ ...PROFILE, emailVerifiedAt: '2026-11-04T00:00:00.000Z' })
    const { element } = await render()
    expect(element.querySelector('dl')?.textContent).toContain('Verified')
    expect(element.querySelector('a[href="/auth/verify-otp"]')).toBeNull()
  })

  it('shows the error state with the mapped copy and retries through the store', async () => {
    status.set('error')
    error.set(new ApiError({ status: 0, code: 'network' }))
    const { element } = await render()
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'Cannot reach the server',
    )
    load.mockClear()
    Array.from(element.querySelectorAll<HTMLButtonElement>('[role="alert"] button'))
      .find((node) => node.textContent.includes('Try again'))
      ?.click()
    expect(load).toHaveBeenCalledOnce()
  })

  it('signs out from the header button', async () => {
    status.set('loaded')
    profile.set(PROFILE)
    const { buttonByText } = await render()
    buttonByText('Sign out')?.click()
    expect(logout).toHaveBeenCalledOnce()
  })

  describe('the phone form', () => {
    async function renderLoaded() {
      status.set('loaded')
      profile.set(PROFILE)
      const page = await render()
      const input = page.element.querySelector<HTMLInputElement>('input')
      if (!input) throw new Error('no phone field')
      const enter = async (value: string) => {
        input.value = value
        input.dispatchEvent(new Event('input'))
        page.element.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }))
        await page.fixture.whenStable()
      }
      return { ...page, input, enter }
    }

    it('starts with the current number and no unsaved changes', async () => {
      const { input, fixture } = await renderLoaded()
      expect(input.value).toBe('+14155550132')
      expect(fixture.componentInstance.hasUnsavedChanges()).toBe(false)
    })

    it('reports unsaved changes once the number is edited', async () => {
      const { fixture, input } = await renderLoaded()
      input.value = '+14155550199'
      input.dispatchEvent(new Event('input'))
      expect(fixture.componentInstance.hasUnsavedChanges()).toBe(true)
    })

    it('saves a new number and toasts success', async () => {
      update.mockResolvedValue({ ok: true, value: undefined })
      const { enter } = await renderLoaded()
      await enter('+14155550199')
      expect(update).toHaveBeenCalledWith({ phone: '+14155550199' })
      expect(showSuccess).toHaveBeenCalledWith('profile.saved')
    })

    it('sends null to remove the number', async () => {
      update.mockResolvedValue({ ok: true, value: undefined })
      const { enter } = await renderLoaded()
      await enter('')
      expect(update).toHaveBeenCalledWith({ phone: null })
    })

    it('does not save a number that is not E.164', async () => {
      const { enter, element } = await renderLoaded()
      await enter('0501234567')
      expect(update).not.toHaveBeenCalled()
      expect(element.querySelector('.form-field__error')?.textContent).toContain('expected format')
    })

    it('puts a server field error on the phone field', async () => {
      update.mockResolvedValue({
        ok: false,
        error: new ApiError({
          status: 400,
          code: 'validation_failed',
          fieldErrors: { phone: ['invalid'] },
        }),
      })
      const { enter, element } = await renderLoaded()
      await enter('+14155550199')
      expect(element.querySelector('.form-field__error')?.textContent.trim()).toBe(
        'This value is not valid',
      )
      expect(showError).not.toHaveBeenCalled()
    })
  })
})
