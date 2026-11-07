import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { FormControl, ReactiveFormsModule } from '@angular/forms'

import { provideTestTranslator } from '@app/core/i18n/translator.testing'

import { InputComponent, type InputType } from './input.component'

@Component({
  imports: [InputComponent, ReactiveFormsModule],
  template: `<app-input
    [formControl]="control"
    [type]="type"
    autocomplete="email"
    inputmode="email"
    placeholder="you@example.com"
  />`,
})
class HostComponent {
  control = new FormControl<string | number | null>('start')
  type: InputType = 'text'
}

async function render(type: InputType = 'text') {
  TestBed.configureTestingModule({ providers: [provideTestTranslator()] })
  const fixture = TestBed.createComponent(HostComponent)
  fixture.componentInstance.type = type
  await fixture.whenStable()
  const element = fixture.nativeElement as HTMLElement
  const input = element.querySelector('input') as HTMLInputElement
  return { fixture, element, input, control: fixture.componentInstance.control }
}

function type(input: HTMLInputElement, text: string) {
  input.value = text
  input.dispatchEvent(new Event('input'))
}

describe('InputComponent', () => {
  it('shows the model value and writes typed text back', async () => {
    const { fixture, input, control } = await render()
    expect(input.value).toBe('start')
    type(input, 'hello')
    expect(control.value).toBe('hello')
    await fixture.whenStable()
    control.setValue('model')
    await fixture.whenStable()
    expect(input.value).toBe('model')
    control.reset()
    await fixture.whenStable()
    expect(input.value).toBe('')
  })

  it('follows the disabled state of the control', async () => {
    const { fixture, input, control } = await render()
    control.disable()
    await fixture.whenStable()
    expect(input.disabled).toBe(true)
    control.enable()
    await fixture.whenStable()
    expect(input.disabled).toBe(false)
  })

  it('marks the control touched on blur', async () => {
    const { input, control } = await render()
    expect(control.touched).toBe(false)
    input.dispatchEvent(new Event('blur'))
    expect(control.touched).toBe(true)
  })

  it('passes the native attributes through', async () => {
    const { input } = await render('email')
    expect(input.type).toBe('email')
    expect(input.getAttribute('autocomplete')).toBe('email')
    expect(input.getAttribute('inputmode')).toBe('email')
    expect(input.getAttribute('placeholder')).toBe('you@example.com')
  })

  it('holds a number for type number and null when empty', async () => {
    const { input, control } = await render('number')
    type(input, '42')
    expect(control.value).toBe(42)
    type(input, '')
    expect(control.value).toBeNull()
  })

  it('toggles a password between hidden and shown through a labelled button', async () => {
    const { fixture, element, input } = await render('password')
    const toggle = () => element.querySelector('.control__toggle button') as HTMLButtonElement
    expect(input.type).toBe('password')
    expect(toggle().getAttribute('aria-label')).toBe('Show password')
    expect(toggle().type).toBe('button')
    toggle().click()
    await fixture.whenStable()
    expect(input.type).toBe('text')
    expect(toggle().getAttribute('aria-label')).toBe('Hide password')
  })

  it('has no toggle for other types', async () => {
    const { element } = await render('text')
    expect(element.querySelector('.control__toggle')).toBeNull()
  })
})
