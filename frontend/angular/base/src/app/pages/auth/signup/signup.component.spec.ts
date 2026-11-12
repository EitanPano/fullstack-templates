import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router, provideRouter } from '@angular/router'

import { provideTestTranslator } from '@app/core/i18n/translator.testing'
import { NotificationService } from '@app/core/providers/notification.service'
import type { Outcome } from '@app/models/api/type'
import { ApiError } from '@app/services/api-error'
import { AuthStore } from '@app/store/auth.store'

import { SignupComponent } from './signup.component'

function type(input: HTMLInputElement | undefined, value: string) {
  if (!input) throw new Error('input not found')
  input.value = value
  input.dispatchEvent(new Event('input'))
}

describe('SignupComponent', () => {
  const signup = vi.fn<(credentials: unknown) => Promise<Outcome<unknown>>>()
  const showError = vi.fn<(key: string) => number>(() => 1)

  async function render(next?: string) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestTranslator(),
        { provide: AuthStore, useValue: { signup, loading: signal(false) } },
        { provide: NotificationService, useValue: { showError } },
      ],
    })
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true)
    const fixture = TestBed.createComponent(SignupComponent)
    if (next !== undefined) fixture.componentRef.setInput('next', next)
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement
    const submit = async () => {
      element.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }))
      await fixture.whenStable()
    }
    const fill = (email: string, password: string, confirm: string) => {
      type(element.querySelector<HTMLInputElement>('input[type="email"]') ?? undefined, email)
      const [first, second] = Array.from(
        element.querySelectorAll<HTMLInputElement>('input[type="password"]'),
      )
      type(first, password)
      type(second, confirm)
    }
    return { element, navigate, submit, fill }
  }

  beforeEach(() => {
    signup.mockReset()
    showError.mockClear()
  })

  it('has one h1 and links to the login screen', async () => {
    const { element } = await render()
    expect(element.querySelectorAll('h1')).toHaveLength(1)
    expect(element.querySelector('.signup__alt a')?.getAttribute('href')).toBe('/auth/login')
  })

  it('shows a mismatched confirmation on the confirm field and does not submit', async () => {
    const { element, submit, fill } = await render()
    fill('ada@example.com', 'longenough1', 'different1')
    await submit()
    expect(signup).not.toHaveBeenCalled()
    const errors = Array.from(element.querySelectorAll('.form-field__error')).map((node) =>
      node.textContent.trim(),
    )
    expect(errors).toEqual(['', '', 'The values do not match'])
  })

  it('signs up with the email and password only, then goes to next', async () => {
    signup.mockResolvedValue({ ok: true, value: undefined })
    const { navigate, submit, fill } = await render('/profile')
    fill('ada@example.com', 'longenough1', 'longenough1')
    await submit()
    expect(signup).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'longenough1' })
    expect(navigate).toHaveBeenCalledWith('/profile')
  })

  it('goes home by default', async () => {
    signup.mockResolvedValue({ ok: true, value: undefined })
    const { navigate, submit, fill } = await render()
    fill('ada@example.com', 'longenough1', 'longenough1')
    await submit()
    expect(navigate).toHaveBeenCalledWith('/')
  })

  it('stays after a conflict without a second toast', async () => {
    signup.mockResolvedValue({ ok: false, error: new ApiError({ status: 409, code: 'conflict' }) })
    const { navigate, submit, fill } = await render()
    fill('ada@example.com', 'longenough1', 'longenough1')
    await submit()
    expect(navigate).not.toHaveBeenCalled()
    expect(showError).not.toHaveBeenCalled()
  })

  it('puts a server field error on its field', async () => {
    signup.mockResolvedValue({
      ok: false,
      error: new ApiError({
        status: 400,
        code: 'validation_failed',
        fieldErrors: { password: ['invalid'] },
      }),
    })
    const { element, submit, fill } = await render()
    fill('ada@example.com', 'longenough1', 'longenough1')
    await submit()
    const errors = Array.from(element.querySelectorAll('.form-field__error')).map((node) =>
      node.textContent.trim(),
    )
    expect(errors).toEqual(['', 'This value is not valid', ''])
    expect(showError).not.toHaveBeenCalled()
  })
})
