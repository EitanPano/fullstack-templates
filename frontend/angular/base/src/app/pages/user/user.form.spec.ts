import { TestBed } from '@angular/core/testing'

import { profileForm } from './user.form'

describe('profileForm', () => {
  it('starts with the given number and accepts an empty one (remove the number)', () => {
    const form = TestBed.runInInjectionContext(() => profileForm('+14155550132'))
    expect(form.controls.phone.value).toBe('+14155550132')
    form.controls.phone.setValue('')
    expect(form.valid).toBe(true)
  })

  it('accepts an E.164 number and rejects anything else with the schema pattern copy', () => {
    const form = TestBed.runInInjectionContext(() => profileForm())
    form.controls.phone.setValue('+14155550132')
    expect(form.valid).toBe(true)
    form.controls.phone.setValue('0501234567')
    expect(form.valid).toBe(false)
    expect(form.controls.phone.errors?.['schema']).toEqual({ messageKey: 'errors.pattern' })
  })
})
