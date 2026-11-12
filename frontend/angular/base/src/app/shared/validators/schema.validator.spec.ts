import { FormControl, FormGroup } from '@angular/forms'
import { check, number, object, text } from '@app/shared/utils/validation'

import { schemaValidator } from './schema.validator'

const schema = object({
  email: text({ min: 1, pattern: /^[^@\s]+@[^@\s]+$/ }),
  password: text({ min: 8, max: 12 }),
  profile: object({ age: number({ min: 18 }) }),
})

function build(values?: { email: string; password: string; age: number }) {
  return new FormGroup(
    {
      email: new FormControl(values?.email ?? '', { nonNullable: true }),
      password: new FormControl(values?.password ?? '', { nonNullable: true }),
      profile: new FormGroup({ age: new FormControl(values?.age ?? 30, { nonNullable: true }) }),
    },
    { validators: schemaValidator(schema) },
  )
}

describe('schemaValidator', () => {
  it('writes an issue onto the control its path names, with the schema numbers', () => {
    const form = build({ email: 'a@b', password: 'short', age: 30 })
    expect(form.controls.password.errors).toEqual({
      schema: { messageKey: 'errors.minlength', params: { min: 8 } },
    })
    expect(form.controls.email.errors).toBeNull()
    expect(form.invalid).toBe(true)
  })

  it('lands an issue on a nested path on the nested control', () => {
    const form = build({ email: 'a@b', password: 'long enough', age: 12 })
    expect(form.controls.profile.controls.age.errors).toEqual({
      schema: { messageKey: 'errors.min', params: { min: 18 } },
    })
  })

  it('maps an empty required string to required and a bad format to pattern', () => {
    const form = build({ email: '', password: 'long enough', age: 30 })
    expect(form.controls.email.errors).toEqual({ schema: { messageKey: 'errors.required' } })
    form.controls.email.setValue('nope')
    expect(form.controls.email.errors).toEqual({ schema: { messageKey: 'errors.pattern' } })
  })

  it('maps an upper bound to maxlength', () => {
    const form = build({ email: 'a@b', password: 'much too long for this', age: 30 })
    expect(form.controls.password.errors).toEqual({
      schema: { messageKey: 'errors.maxlength', params: { max: 12 } },
    })
  })

  it('clears the schema error once the value is fixed and keeps other errors', () => {
    const form = build({ email: 'a@b', password: 'short', age: 30 })
    form.controls.password.setValue('long enough')
    expect(form.controls.password.errors).toBeNull()
    expect(form.valid).toBe(true)
    expect(form.errors).toBeNull()

    form.controls.email.setErrors({ custom: true })
    form.controls.password.setValue('x')
    expect(form.controls.password.errors).toHaveProperty('schema')
    form.controls.password.setValue('long enough')
    expect(form.controls.email.errors).toEqual({ custom: true })
  })

  it('surfaces a path with no control as a group error', () => {
    const group = new FormGroup(
      { email: new FormControl('a@b', { nonNullable: true }) },
      {
        validators: schemaValidator(object({ email: text(), extra: text() })),
      },
    )
    expect(group.errors).toEqual({
      schema: { messageKey: 'errors.required', paths: ['extra'] },
    })
    expect(group.controls.email.errors).toBeNull()
  })

  it('maps a root-level refinement to a group error', () => {
    const group = new FormGroup(
      { a: new FormControl('x', { nonNullable: true }) },
      { validators: schemaValidator(check(object({ a: text() }), () => false, { message: 'never' })) },
    )
    expect(group.errors).toEqual({ schema: { messageKey: 'errors.invalid', paths: [''] } })
  })
})
