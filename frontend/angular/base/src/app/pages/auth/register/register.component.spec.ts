import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router, provideRouter } from '@angular/router'

import { provideTestTranslator } from '@app/core/i18n/translator.testing'
import { NotificationService } from '@app/core/providers/notification.service'
import { ApiError } from '@app/models/api/response'
import { AuthStore } from '@app/store/auth.store'

import { RegisterComponent } from './register.component'

function type(input: HTMLInputElement | undefined, value: string) {
  if (!input) throw new Error('input not found')
  input.value = value
  input.dispatchEvent(new Event('input'))
}

describe('RegisterComponent', () => {
  const register = vi.fn<(credentials: unknown) => Promise<boolean>>()
  const error = signal<ApiError | null>(null)
  const showError = vi.fn<(key: string) => number>(() => 1)

  async function render(next?: string) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestTranslator(),
        { provide: AuthStore, useValue: { register, error, loading: signal(false) } },
        { provide: NotificationService, useValue: { showError } },
      ],
    })
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true)
    const fixture = TestBed.createComponent(RegisterComponent)
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
    register.mockReset()
    showError.mockClear()
    error.set(null)
  })

  it('has one h1 and links to the login screen', async () => {
    const { element } = await render()
    expect(element.querySelectorAll('h1')).toHaveLength(1)
    expect(element.querySelector('.register__alt a')?.getAttribute('href')).toBe('/auth/login')
  })

  it('shows a mismatched confirmation on the confirm field and does not submit', async () => {
    const { element, submit, fill } = await render()
    fill('ada@example.com', 'longenough1', 'different1')
    await submit()
    expect(register).not.toHaveBeenCalled()
    const errors = Array.from(element.querySelectorAll('.form-field__error')).map((node) =>
      node.textContent.trim(),
    )
    expect(errors).toEqual(['', '', 'The values do not match'])
  })

  it('registers with the email and password only, then goes to next', async () => {
    register.mockResolvedValue(true)
    const { navigate, submit, fill } = await render('/profile')
    fill('ada@example.com', 'longenough1', 'longenough1')
    await submit()
    expect(register).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'longenough1' })
    expect(navigate).toHaveBeenCalledWith('/profile')
  })

  it('goes home by default', async () => {
    register.mockResolvedValue(true)
    const { navigate, submit, fill } = await render()
    fill('ada@example.com', 'longenough1', 'longenough1')
    await submit()
    expect(navigate).toHaveBeenCalledWith('/')
  })

  it('stays after a conflict without a second toast', async () => {
    register.mockResolvedValue(false)
    error.set(new ApiError({ status: 409, code: 'conflict' }))
    const { navigate, submit, fill } = await render()
    fill('ada@example.com', 'longenough1', 'longenough1')
    await submit()
    expect(navigate).not.toHaveBeenCalled()
    expect(showError).not.toHaveBeenCalled()
  })

  it('puts a server field error on its field', async () => {
    register.mockResolvedValue(false)
    error.set(
      new ApiError({
        status: 400,
        code: 'validation_failed',
        fieldErrors: { password: ['invalid'] },
      }),
    )
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
