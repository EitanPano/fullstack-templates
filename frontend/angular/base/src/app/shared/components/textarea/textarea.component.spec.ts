import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { FormControl, ReactiveFormsModule } from '@angular/forms'

import { provideTestTranslator } from '@app/core/i18n/translator.testing'

import { TextareaComponent } from './textarea.component'

@Component({
  imports: [TextareaComponent, ReactiveFormsModule],
  template: `<app-textarea [formControl]="control" [rows]="6" [maxlength]="max()" />`,
})
class HostComponent {
  control = new FormControl<string | null>('abc')
  max = signal<number | null>(10)
}

async function render() {
  TestBed.configureTestingModule({ providers: [provideTestTranslator()] })
  const fixture = TestBed.createComponent(HostComponent)
  await fixture.whenStable()
  const element = fixture.nativeElement as HTMLElement
  const area = element.querySelector('textarea') as HTMLTextAreaElement
  return { fixture, element, area, host: fixture.componentInstance }
}

describe('TextareaComponent', () => {
  it('round-trips the value and sets rows and maxlength', async () => {
    const { area, host } = await render()
    expect(area.value).toBe('abc')
    expect(area.rows).toBe(6)
    expect(area.getAttribute('maxlength')).toBe('10')
    area.value = 'hello'
    area.dispatchEvent(new Event('input'))
    expect(host.control.value).toBe('hello')
  })

  it('counts the characters left and describes the textarea with the counter', async () => {
    const { fixture, element, area } = await render()
    const counter = element.querySelector('.control__counter') as HTMLElement
    expect(counter.textContent).toContain('7 characters left')
    expect(area.getAttribute('aria-describedby')).toBe(counter.id)
    area.value = 'abcdefghij'
    area.dispatchEvent(new Event('input'))
    await fixture.whenStable()
    expect(counter.textContent).toContain('0 characters left')
  })

  it('shows no counter without a maxlength', async () => {
    const { fixture, element, area, host } = await render()
    host.max.set(null)
    await fixture.whenStable()
    expect(element.querySelector('.control__counter')).toBeNull()
    expect(area.hasAttribute('aria-describedby')).toBe(false)
  })

  it('follows the disabled state', async () => {
    const { fixture, area, host } = await render()
    host.control.disable()
    await fixture.whenStable()
    expect(area.disabled).toBe(true)
  })
})
