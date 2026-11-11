import { TestBed } from '@angular/core/testing'

import { loginForm, otpForm, signupForm } from './auth.form'

function messageKeyOf(control: { errors: Record<string, unknown> | null } | null): unknown {
  const zod = control?.errors?.['zod'] as { messageKey?: string } | undefined
  return zod?.messageKey
}

// A malformed e-mail is not asserted: the bun-express contract has no e-mail pattern (the python
// one does); the server's 422 is the guard.
describe('auth.form', () => {
  describe('loginForm', () => {
    it('is valid with an address and a password the contract accepts', () => {
      const form = TestBed.runInInjectionContext(loginForm)
      form.setValue({ email: 'ada@example.com', password: 'longenough1' })
      expect(form.valid).toBe(true)
    })

    it('reports the contract rules on the controls', () => {
      const form = TestBed.runInInjectionContext(loginForm)
      form.setValue({ email: 'ada@example.com', password: 'short' })
      expect(form.valid).toBe(false)
      expect(form.controls.password.errors?.['zod']).toEqual({
        messageKey: 'errors.minlength',
        params: { min: 8 },
      })
    })

    it('is invalid when empty and clears an error once the value is fixed', () => {
      const form = TestBed.runInInjectionContext(loginForm)
      expect(form.valid).toBe(false)
      form.setValue({ email: 'ada@example.com', password: 'longenough1' })
      expect(form.controls.email.errors).toBeNull()
      expect(form.controls.password.errors).toBeNull()
    })
  })

  describe('signupForm', () => {
    it('puts a match error on the confirm control while it differs', () => {
      const form = TestBed.runInInjectionContext(signupForm)
      form.setValue({ email: 'ada@example.com', password: 'longenough1', confirm: 'different1' })
      expect(form.controls.confirm.errors?.['match']).toBe(true)
      expect(form.valid).toBe(false)
    })

    it('is valid once the confirm control agrees', () => {
      const form = TestBed.runInInjectionContext(signupForm)
      form.setValue({ email: 'ada@example.com', password: 'longenough1', confirm: 'different1' })
      form.controls.confirm.setValue('longenough1')
      expect(form.controls.confirm.errors).toBeNull()
      expect(form.valid).toBe(true)
    })

    it('still reports the contract rules next to the match rule', () => {
      const form = TestBed.runInInjectionContext(signupForm)
      form.setValue({ email: 'ada@example.com', password: 'short', confirm: 'short' })
      expect(messageKeyOf(form.controls.password)).toBe('errors.minlength')
      expect(form.controls.confirm.errors).toBeNull()
    })
  })

  describe('otpForm', () => {
    it('accepts six digits only', () => {
      const form = TestBed.runInInjectionContext(otpForm)
      form.setValue({ code: '123456' })
      expect(form.valid).toBe(true)
      form.setValue({ code: '12a456' })
      expect(form.valid).toBe(false)
      expect(messageKeyOf(form.controls.code)).toBe('errors.pattern')
    })

    it('is invalid when empty', () => {
      const form = TestBed.runInInjectionContext(otpForm)
      expect(form.valid).toBe(false)
    })
  })
})
