import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router, provideRouter } from '@angular/router'

import { provideTestTranslator } from '@app/core/i18n/translator.testing'
import { NotificationService } from '@app/core/providers/notification.service'
import { ApiError } from '@app/models/api/response'
import { AuthStore } from '@app/store/auth.store'

import { LoginComponent } from './login.component'

function type(input: HTMLInputElement | null, value: string) {
  if (!input) throw new Error('input not found')
  input.value = value
  input.dispatchEvent(new Event('input'))
}

describe('LoginComponent', () => {
  const login = vi.fn<(credentials: unknown) => Promise<boolean>>()
  const error = signal<ApiError | null>(null)
  const showError = vi.fn<(key: string) => number>(() => 1)
  const loading = signal(false)

  async function render(next?: string) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestTranslator(),
        { provide: AuthStore, useValue: { login, error, loading } },
        { provide: NotificationService, useValue: { showError } },
      ],
    })
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true)
    const fixture = TestBed.createComponent(LoginComponent)
    if (next !== undefined) fixture.componentRef.setInput('next', next)
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement
    const submit = async () => {
      element.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }))
      await fixture.whenStable()
    }
    const fill = (email: string, password: string) => {
      type(element.querySelector('input[type="email"]'), email)
      type(element.querySelector('input[type="password"]'), password)
    }
    return { fixture, element, navigate, submit, fill }
  }

  beforeEach(() => {
    login.mockReset()
    showError.mockClear()
    error.set(null)
    loading.set(false)
  })

  it('has one h1 and links to the register screen', async () => {
    const { element } = await render()
    expect(element.querySelectorAll('h1')).toHaveLength(1)
    expect(element.querySelector('h1')?.textContent).toBe('Sign in')
    expect(element.querySelector('.login__alt a')?.getAttribute('href')).toBe('/auth/register')
  })

  // A malformed e-mail is not asserted: the bun-express contract has no e-mail pattern (the python
  // one does); the server's 422 is the guard.
  it('does not call the store while the contract rules fail, and shows them on the fields', async () => {
    const { element, submit, fill } = await render()
    fill('ada@example.com', 'short')
    await submit()
    expect(login).not.toHaveBeenCalled()
    const errors = Array.from(element.querySelectorAll('.form-field__error'))
      .map((node) => node.textContent.trim())
      .filter(Boolean)
    expect(errors).toEqual(['Enter at least 8 characters'])
  })

  it('carries next to the register screen', async () => {
    const { element } = await render('/profile')
    expect(element.querySelector('.login__alt a')?.getAttribute('href')).toBe(
      '/auth/register?next=%2Fprofile',
    )
  })

  it('submits the credentials and goes to next after success', async () => {
    login.mockResolvedValue(true)
    const { navigate, submit, fill } = await render('/profile?tab=2')
    fill('ada@example.com', 'longenough1')
    await submit()
    expect(login).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'longenough1' })
    expect(navigate).toHaveBeenCalledWith('/profile?tab=2')
  })

  it('goes home when next is not a path on this site', async () => {
    login.mockResolvedValue(true)
    const { navigate, submit, fill } = await render('https://evil.example')
    fill('ada@example.com', 'longenough1')
    await submit()
    expect(navigate).toHaveBeenCalledWith('/')
  })

  it('stays on the page after a failure, and does not toast again (the store did)', async () => {
    login.mockResolvedValue(false)
    error.set(new ApiError({ status: 401, code: 'unauthenticated' }))
    const { navigate, submit, fill } = await render()
    fill('ada@example.com', 'longenough1')
    await submit()
    expect(navigate).not.toHaveBeenCalled()
    expect(showError).not.toHaveBeenCalled()
  })

  it('puts a server field error on its field and toasts nothing', async () => {
    login.mockResolvedValue(false)
    error.set(
      new ApiError({ status: 400, code: 'validation_failed', fieldErrors: { email: ['invalid'] } }),
    )
    const { element, submit, fill } = await render()
    fill('ada@example.com', 'longenough1')
    await submit()
    expect(element.querySelector('.form-field__error')?.textContent.trim()).toBe(
      'This value is not valid',
    )
    expect(showError).not.toHaveBeenCalled()
  })

  it('toasts once for a field error that no field shows', async () => {
    login.mockResolvedValue(false)
    error.set(
      new ApiError({ status: 400, code: 'validation_failed', fieldErrors: { other: ['invalid'] } }),
    )
    const { submit, fill } = await render()
    fill('ada@example.com', 'longenough1')
    await submit()
    expect(showError).toHaveBeenCalledTimes(1)
    expect(showError).toHaveBeenCalledWith('errors.validation_failed')
  })
})
