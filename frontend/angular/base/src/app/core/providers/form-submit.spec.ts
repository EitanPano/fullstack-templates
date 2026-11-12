import { TestBed } from '@angular/core/testing'
import { FormControl, FormGroup } from '@angular/forms'

import { DROPPED } from '@app/models/api/constant'
import type { Outcome } from '@app/models/api/type'
import { ApiError } from '@app/services/api-error'

import { injectFormSubmit } from './form-submit'
import { NotificationService } from './notification.service'

describe('injectFormSubmit', () => {
  const showError = vi.fn<(key: string) => number>(() => 1)

  const setup = (email = 'ada@example.com') => {
    const form = new FormGroup({ email: new FormControl(email, { nonNullable: true }) })
    if (email === '') form.controls.email.setErrors({ required: true })
    const submit = TestBed.runInInjectionContext(() => injectFormSubmit(form))
    return { form, submit }
  }

  beforeEach(() => {
    showError.mockClear()
    TestBed.configureTestingModule({
      providers: [{ provide: NotificationService, useValue: { showError } }],
    })
  })

  it('awaits the call and resolves its outcome, pending meanwhile', async () => {
    const { submit } = setup()
    let finish: (outcome: Outcome<string>) => void = () => undefined
    const running = submit.run(() => new Promise<Outcome<string>>((resolve) => (finish = resolve)))
    expect(submit.pending()).toBe(true)
    finish({ ok: true, value: 'saved' })
    expect(await running).toEqual({ ok: true, value: 'saved' })
    expect(submit.pending()).toBe(false)
  })

  it('does not call for an invalid form', async () => {
    const { submit } = setup('')
    const call = vi.fn(() => Promise.resolve<Outcome<void>>({ ok: true, value: undefined }))
    expect(await submit.run(call)).toBe(DROPPED)
    expect(call).not.toHaveBeenCalled()
  })

  it('refuses a second submit while one is pending', async () => {
    const { submit } = setup()
    const first = submit.run(() => new Promise<Outcome<void>>(() => undefined))
    const call = vi.fn(() => Promise.resolve<Outcome<void>>({ ok: true, value: undefined }))
    expect(await submit.run(call)).toBe(DROPPED)
    expect(call).not.toHaveBeenCalled()
    void first
  })

  it('puts a server validation failure on its fields without a toast', async () => {
    const { form, submit } = setup()
    const error = new ApiError({
      status: 400,
      code: 'validation_failed',
      fieldErrors: { email: ['invalid'] },
    })
    await submit.run(() => Promise.resolve<Outcome<void>>({ ok: false, error }))
    expect(form.controls.email.errors).toEqual({ server: { messageKey: 'errors.invalid' } })
    expect(showError).not.toHaveBeenCalled()
  })

  it.each([
    ['a path no field shows', { nickname: ['invalid'] }],
    ['no field paths at all', undefined],
  ])('toasts validation_failed once for %s', async (_what, fieldErrors) => {
    const { submit } = setup()
    const error = new ApiError({
      status: 400,
      code: 'validation_failed',
      ...(fieldErrors ? { fieldErrors } : {}),
    })
    await submit.run(() => Promise.resolve<Outcome<void>>({ ok: false, error }))
    expect(showError).toHaveBeenCalledTimes(1)
    expect(showError).toHaveBeenCalledWith('errors.validation_failed')
  })

  it('leaves every other failure to the store, which has toasted it', async () => {
    const { submit } = setup()
    const error = new ApiError({ status: 409, code: 'conflict' })
    expect(await submit.run(() => Promise.resolve<Outcome<void>>({ ok: false, error }))).toEqual({
      ok: false,
      error,
    })
    expect(showError).not.toHaveBeenCalled()
  })
})
