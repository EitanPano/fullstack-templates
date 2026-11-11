import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { FormControl, ReactiveFormsModule } from '@angular/forms'

import { CheckboxComponent } from './checkbox.component'

@Component({
  imports: [CheckboxComponent, ReactiveFormsModule],
  template: `<app-checkbox [formControl]="control">Remember me</app-checkbox>`,
})
class HostComponent {
  control = new FormControl<boolean | null>(true)
}

async function render() {
  const fixture = TestBed.createComponent(HostComponent)
  await fixture.whenStable()
  const element = fixture.nativeElement as HTMLElement
  const box = element.querySelector('input') as HTMLInputElement
  return { fixture, element, box, control: fixture.componentInstance.control }
}

describe('CheckboxComponent', () => {
  it('shows the projected label and the model value', async () => {
    const { element, box } = await render()
    expect(element.querySelector('label')?.textContent).toContain('Remember me')
    expect(box.checked).toBe(true)
  })

  it('writes the checked state back and follows the model', async () => {
    const { fixture, box, control } = await render()
    box.checked = false
    box.dispatchEvent(new Event('change'))
    expect(control.value).toBe(false)
    await fixture.whenStable()
    control.setValue(true)
    await fixture.whenStable()
    expect(box.checked).toBe(true)
    control.reset()
    await fixture.whenStable()
    expect(box.checked).toBe(false)
  })

  it('follows the disabled state and marks touched on blur', async () => {
    const { fixture, box, control } = await render()
    control.disable()
    await fixture.whenStable()
    expect(box.disabled).toBe(true)
    control.enable()
    box.dispatchEvent(new Event('blur'))
    expect(control.touched).toBe(true)
  })
})
