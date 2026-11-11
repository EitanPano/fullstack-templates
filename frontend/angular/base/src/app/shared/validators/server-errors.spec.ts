import { FormControl, FormGroup } from '@angular/forms'

import { ApiError } from '@app/services/api-error'

import { applyFieldErrors } from './server-errors'

describe('applyFieldErrors', () => {
  it('sets a server error on each mapped path, touches it, and returns the unmapped paths', () => {
    const form = new FormGroup({
      email: new FormControl(''),
      address: new FormGroup({ city: new FormControl('') }),
    })
    const error = new ApiError({
      status: 400,
      code: 'validation_failed',
      fieldErrors: { email: ['invalid'], 'address.city': ['invalid'], nickname: ['invalid'] },
    })
    expect(applyFieldErrors(form, error)).toEqual(['nickname'])
    expect(form.controls.email.errors).toEqual({ server: { messageKey: 'errors.invalid' } })
    expect(form.controls.email.touched).toBe(true)
    expect(form.controls.address.controls.city.errors).toEqual({
      server: { messageKey: 'errors.invalid' },
    })
  })

  it('returns nothing when the error has no field errors', () => {
    const form = new FormGroup({ email: new FormControl('') })
    expect(
      applyFieldErrors(form, new ApiError({ status: 400, code: 'validation_failed' })),
    ).toEqual([])
    expect(form.controls.email.errors).toBeNull()
  })

  it('clears the server error when the control is edited', () => {
    const form = new FormGroup({ email: new FormControl('') })
    applyFieldErrors(
      form,
      new ApiError({ status: 400, code: 'validation_failed', fieldErrors: { email: ['invalid'] } }),
    )
    form.controls.email.setValue('a@b.c')
    expect(form.controls.email.errors).toBeNull()
  })
})
