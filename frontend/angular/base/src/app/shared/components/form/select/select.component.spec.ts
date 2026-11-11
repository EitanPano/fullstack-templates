import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { FormControl, ReactiveFormsModule } from '@angular/forms'

import { provideTestTranslator } from '@app/core/i18n/translator.testing'

import { SelectComponent, type SelectOption } from './select.component'

const OPTIONS: SelectOption[] = [
  { value: 'light', labelKey: 'theme.light' },
  { value: 'dark', labelKey: 'theme.dark' },
]

@Component({
  imports: [SelectComponent, ReactiveFormsModule],
  template: `<app-select [formControl]="control" [options]="options" [emptyKey]="emptyKey()" />`,
})
class HostComponent {
  control = new FormControl<string | null>('dark')
  options = OPTIONS
  emptyKey = signal<string | null>(null)
}

async function render() {
  TestBed.configureTestingModule({ providers: [provideTestTranslator()] })
  const fixture = TestBed.createComponent(HostComponent)
  await fixture.whenStable()
  const element = fixture.nativeElement as HTMLElement
  const select = element.querySelector('select') as HTMLSelectElement
  return { fixture, select, host: fixture.componentInstance }
}

describe('SelectComponent', () => {
  it('renders translated options and selects the model value', async () => {
    const { select } = await render()
    expect([...select.options].map((option) => option.textContent.trim())).toEqual([
      'Light',
      'Dark',
    ])
    expect(select.value).toBe('dark')
  })

  it('writes the chosen value back and follows the model', async () => {
    const { fixture, select, host } = await render()
    select.value = 'light'
    select.dispatchEvent(new Event('change'))
    expect(host.control.value).toBe('light')
    await fixture.whenStable()
    host.control.setValue('dark')
    await fixture.whenStable()
    expect(select.value).toBe('dark')
  })

  it('offers an empty option when emptyKey is set', async () => {
    const { fixture, select, host } = await render()
    host.emptyKey.set('theme.system')
    host.control.setValue('')
    await fixture.whenStable()
    expect(select.options[0].value).toBe('')
    expect(select.options[0].textContent.trim()).toBe('System')
    expect(select.value).toBe('')
  })

  it('follows the disabled state and marks touched on blur', async () => {
    const { fixture, select, host } = await render()
    host.control.disable()
    await fixture.whenStable()
    expect(select.disabled).toBe(true)
    host.control.enable()
    select.dispatchEvent(new Event('blur'))
    expect(host.control.touched).toBe(true)
  })
})
