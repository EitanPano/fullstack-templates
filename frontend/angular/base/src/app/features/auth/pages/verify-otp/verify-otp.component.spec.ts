import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router, provideRouter } from '@angular/router'

import { provideTestTranslator } from '@app/core/i18n/translator.testing'
import { NotificationService } from '@app/core/providers/notification.service'
import { ApiError } from '@app/models/api/response'
import type { PublicUser } from '@app/models/user/interface'
import { AuthStore } from '@app/store/auth.store'

import { VerifyOtpComponent } from './verify-otp.component'

describe('VerifyOtpComponent', () => {
  const requestOtp = vi.fn<() => Promise<boolean>>()
  const verifyOtp = vi.fn<(code: string) => Promise<boolean>>()
  const error = signal<ApiError | null>(null)
  const showError = vi.fn<(key: string) => number>(() => 1)
  const showSuccess = vi.fn<(key: string) => number>(() => 1)

  async function render() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestTranslator(),
        {
          provide: AuthStore,
          useValue: {
            requestOtp,
            verifyOtp,
            error,
            loading: signal(false),
            user: signal({ email: 'ada@example.com' } as PublicUser),
          },
        },
        { provide: NotificationService, useValue: { showError, showSuccess } },
      ],
    })
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true)
    const fixture = TestBed.createComponent(VerifyOtpComponent)
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement
    const clickByText = async (text: string) => {
      const button = Array.from(element.querySelectorAll('button')).find((node) =>
        node.textContent.includes(text),
      )
      button?.click()
      await fixture.whenStable()
    }
    return { fixture, element, navigate, clickByText }
  }

  beforeEach(() => {
    requestOtp.mockReset()
    verifyOtp.mockReset()
    showError.mockClear()
    showSuccess.mockClear()
    error.set(null)
  })

  it('first offers to send a code to the account address', async () => {
    const { element } = await render()
    expect(element.querySelectorAll('h1')).toHaveLength(1)
    expect(element.textContent).toContain('ada@example.com')
    expect(element.querySelector('input')).toBeNull()
  })

  it('shows the code field once a code was sent', async () => {
    requestOtp.mockResolvedValue(true)
    const { element, clickByText } = await render()
    await clickByText('Send code')
    expect(requestOtp).toHaveBeenCalledOnce()
    expect(showSuccess).toHaveBeenCalledWith('auth.otp.sent')
    expect(element.querySelector('input')).not.toBeNull()
  })

  it('keeps the send button when sending failed', async () => {
    requestOtp.mockResolvedValue(false)
    const { element, clickByText } = await render()
    await clickByText('Send code')
    expect(element.querySelector('input')).toBeNull()
    expect(showSuccess).not.toHaveBeenCalled()
  })

  async function sendAndEnter(code: string) {
    requestOtp.mockResolvedValue(true)
    const page = await render()
    await page.clickByText('Send code')
    const input = page.element.querySelector('input')
    if (!input) throw new Error('no code field')
    input.value = code
    input.dispatchEvent(new Event('input'))
    page.element.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }))
    await page.fixture.whenStable()
    return page
  }

  it('rejects a code that is not six digits before calling the store', async () => {
    const { element } = await sendAndEnter('12a')
    expect(verifyOtp).not.toHaveBeenCalled()
    expect(element.querySelector('.form-field__error')?.textContent.trim()).not.toBe('')
  })

  it('verifies a valid code, toasts success and returns to the profile', async () => {
    verifyOtp.mockResolvedValue(true)
    const { navigate } = await sendAndEnter('123456')
    expect(verifyOtp).toHaveBeenCalledWith('123456')
    expect(showSuccess).toHaveBeenCalledWith('auth.otp.verified')
    expect(navigate).toHaveBeenCalledWith('/profile')
  })

  it('stays on the page when the store refuses the code, with no second toast', async () => {
    verifyOtp.mockResolvedValue(false)
    error.set(new ApiError({ status: 429, code: 'rate_limited' }))
    const { navigate } = await sendAndEnter('123456')
    expect(navigate).not.toHaveBeenCalled()
    expect(showError).not.toHaveBeenCalled()
  })
})
