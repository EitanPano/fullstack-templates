import { FormControl, FormGroup } from '@angular/forms'
import * as z from 'zod'

import { zodValidator } from './zod.validator'

const schema = z.object({
  email: z
    .string()
    .min(1)
    .regex(/^[^@\s]+@[^@\s]+$/),
  password: z.string().min(8).max(12),
  profile: z.object({ age: z.number().min(18) }),
})

function build(values?: { email: string; password: string; age: number }) {
  return new FormGroup(
    {
      email: new FormControl(values?.email ?? '', { nonNullable: true }),
      password: new FormControl(values?.password ?? '', { nonNullable: true }),
      profile: new FormGroup({ age: new FormControl(values?.age ?? 30, { nonNullable: true }) }),
    },
    { validators: zodValidator(schema) },
  )
}

describe('zodValidator', () => {
  it('writes an issue onto the control its path names, with the schema numbers', () => {
    const form = build({ email: 'a@b', password: 'short', age: 30 })
    expect(form.controls.password.errors).toEqual({
      zod: { messageKey: 'errors.minlength', params: { min: 8 } },
    })
    expect(form.controls.email.errors).toBeNull()
    expect(form.invalid).toBe(true)
  })

  it('lands an issue on a nested path on the nested control', () => {
    const form = build({ email: 'a@b', password: 'long enough', age: 12 })
    expect(form.controls.profile.controls.age.errors).toEqual({
      zod: { messageKey: 'errors.min', params: { min: 18 } },
    })
  })

  it('maps an empty required string to required and a bad format to pattern', () => {
    const form = build({ email: '', password: 'long enough', age: 30 })
    expect(form.controls.email.errors).toEqual({ zod: { messageKey: 'errors.required' } })
    form.controls.email.setValue('nope')
    expect(form.controls.email.errors).toEqual({ zod: { messageKey: 'errors.pattern' } })
  })

  it('maps an upper bound to maxlength', () => {
    const form = build({ email: 'a@b', password: 'much too long for this', age: 30 })
    expect(form.controls.password.errors).toEqual({
      zod: { messageKey: 'errors.maxlength', params: { max: 12 } },
    })
  })

  it('clears the zod error once the value is fixed and keeps other errors', () => {
    const form = build({ email: 'a@b', password: 'short', age: 30 })
    form.controls.password.setValue('long enough')
    expect(form.controls.password.errors).toBeNull()
    expect(form.valid).toBe(true)
    expect(form.errors).toBeNull()

    form.controls.email.setErrors({ custom: true })
    form.controls.password.setValue('x')
    expect(form.controls.password.errors).toHaveProperty('zod')
    form.controls.password.setValue('long enough')
    expect(form.controls.email.errors).toEqual({ custom: true })
  })

  it('surfaces a path with no control as a group error', () => {
    const group = new FormGroup(
      { email: new FormControl('a@b', { nonNullable: true }) },
      {
        validators: zodValidator(z.object({ email: z.string(), extra: z.string() })),
      },
    )
    expect(group.errors).toEqual({
      zod: { messageKey: 'errors.required', paths: ['extra'] },
    })
    expect(group.controls.email.errors).toBeNull()
  })

  it('maps a root-level refinement to a group error', () => {
    const group = new FormGroup(
      { a: new FormControl('x', { nonNullable: true }) },
      { validators: zodValidator(z.object({ a: z.string() }).refine(() => false)) },
    )
    expect(group.errors).toEqual({ zod: { messageKey: 'errors.invalid', paths: [''] } })
  })
})
