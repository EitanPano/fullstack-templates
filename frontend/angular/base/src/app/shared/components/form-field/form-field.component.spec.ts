import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'

import { provideTestTranslator } from '@app/core/i18n/translator.testing'

import { InputComponent } from '../input/input.component'
import { FormFieldComponent } from './form-field.component'

@Component({
  imports: [FormFieldComponent, InputComponent, ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="submitted = submitted + 1">
      <app-form-field label="Email" hint="Work address">
        <app-input formControlName="email" type="email" />
      </app-form-field>
      <app-form-field label="Nick">
        <app-input formControlName="nick" />
      </app-form-field>
      <app-input formControlName="loose" />
      <button type="submit">Go</button>
    </form>
  `,
})
class HostComponent {
  form = new FormGroup({
    email: new FormControl('', [(c) => Validators.required(c), (c) => Validators.email(c)]),
    nick: new FormControl('ab', [Validators.minLength(3)]),
    loose: new FormControl(''),
  })
  submitted = 0
}

async function render() {
  TestBed.configureTestingModule({ providers: [provideTestTranslator()] })
  const fixture = TestBed.createComponent(HostComponent)
  await fixture.whenStable()
  const element = fixture.nativeElement as HTMLElement
  const fields = [...element.querySelectorAll('app-form-field')] as HTMLElement[]
  const inputs = [...element.querySelectorAll('input')] as HTMLInputElement[]
  return { fixture, element, fields, inputs, host: fixture.componentInstance }
}

describe('FormFieldComponent', () => {
  it('points the label at the control and describes it with the hint', async () => {
    const { fields, inputs } = await render()
    const label = fields[0].querySelector('label') as HTMLLabelElement
    expect(inputs[0].id).not.toBe('')
    expect(label.getAttribute('for')).toBe(inputs[0].id)
    const hint = fields[0].querySelector('.form-field__hint') as HTMLElement
    expect(inputs[0].getAttribute('aria-describedby')).toBe(hint.id)
    expect(inputs[0].hasAttribute('aria-invalid')).toBe(false)
  })

  it('gives each field its own id', async () => {
    const { inputs } = await render()
    expect(inputs[0].id).not.toBe(inputs[1].id)
  })

  it('shows no error before the control is touched', async () => {
    const { fields } = await render()
    expect(fields[0].querySelector('.form-field__error')?.textContent).toBe('')
  })

  it('shows the first error after blur and wires aria-invalid and aria-describedby', async () => {
    const { fixture, fields, inputs } = await render()
    inputs[0].dispatchEvent(new Event('blur'))
    await fixture.whenStable()
    const error = fields[0].querySelector('.form-field__error') as HTMLElement
    expect(error.textContent).toBe('This field is required')
    expect(inputs[0].getAttribute('aria-invalid')).toBe('true')
    expect(inputs[0].getAttribute('aria-describedby')).toContain(error.id)
  })

  it('interpolates the numbers a validator carries', async () => {
    const { fixture, fields, inputs } = await render()
    inputs[1].dispatchEvent(new Event('blur'))
    await fixture.whenStable()
    expect(fields[1].querySelector('.form-field__error')?.textContent).toBe(
      'Enter at least 3 characters',
    )
  })

  it('follows the control: the error changes and clears with the value', async () => {
    const { fixture, fields, inputs } = await render()
    inputs[0].dispatchEvent(new Event('blur'))
    inputs[0].value = 'nope'
    inputs[0].dispatchEvent(new Event('input'))
    await fixture.whenStable()
    const error = fields[0].querySelector('.form-field__error') as HTMLElement
    expect(error.textContent).toBe('Enter a valid email address')
    inputs[0].value = 'a@b.co'
    inputs[0].dispatchEvent(new Event('input'))
    await fixture.whenStable()
    expect(error.textContent).toBe('')
    expect(inputs[0].hasAttribute('aria-invalid')).toBe(false)
  })

  it('shows the errors of every field when the form is submitted untouched', async () => {
    const { fixture, element, fields, host } = await render()
    ;(element.querySelector('button') as HTMLButtonElement).click()
    await fixture.whenStable()
    expect(host.submitted).toBe(1)
    expect(fields[0].querySelector('.form-field__error')?.textContent).toBe(
      'This field is required',
    )
    expect(fields[1].querySelector('.form-field__error')?.textContent).toContain('at least 3')
  })

  it('uses the message key a validator names', async () => {
    const { fixture, fields, inputs, host } = await render()
    host.form.controls.nick.setErrors({ taken: { messageKey: 'errors.invalid' } })
    inputs[1].dispatchEvent(new Event('blur'))
    await fixture.whenStable()
    expect(fields[1].querySelector('.form-field__error')?.textContent).toBe(
      'This value is not valid',
    )
  })

  it('leaves a control outside a field without aria wiring', async () => {
    const { inputs } = await render()
    expect(inputs[2].id).not.toBe('')
    expect(inputs[2].hasAttribute('aria-describedby')).toBe(false)
    expect(inputs[2].hasAttribute('aria-invalid')).toBe(false)
  })
})
