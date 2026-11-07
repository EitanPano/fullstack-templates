import { FormControl, FormGroup } from '@angular/forms'

import { match } from './match'

function build(password: string, confirm: string) {
  return new FormGroup(
    {
      password: new FormControl(password, { nonNullable: true }),
      confirm: new FormControl(confirm, { nonNullable: true }),
    },
    { validators: match('password', 'confirm') },
  )
}

describe('match', () => {
  it('puts a match error on the confirm control while the values differ', () => {
    const form = build('secret one', 'secret two')
    expect(form.controls.confirm.errors).toEqual({ match: true })
    expect(form.invalid).toBe(true)
  })

  it('is valid when they agree, and re-runs when the first control changes', () => {
    const form = build('same', 'same')
    expect(form.controls.confirm.errors).toBeNull()
    form.controls.password.setValue('changed')
    expect(form.controls.confirm.errors).toEqual({ match: true })
    form.controls.confirm.setValue('changed')
    expect(form.valid).toBe(true)
  })

  it('keeps the confirm control other errors', () => {
    const form = build('a', 'a')
    form.controls.confirm.setErrors({ custom: true })
    form.controls.password.setValue('b')
    expect(form.controls.confirm.errors).toEqual({ custom: true, match: true })
  })

  it('does nothing when the confirm control does not exist', () => {
    const form = new FormGroup(
      { password: new FormControl('x') },
      { validators: match('password', 'missing') },
    )
    expect(form.valid).toBe(true)
  })
})
