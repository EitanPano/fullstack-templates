import { Component, type Type } from '@angular/core'
import { TestBed } from '@angular/core/testing'

import { AutofocusDirective } from './autofocus.directive'

@Component({
  imports: [AutofocusDirective],
  template: `
    <input class="plain" />
    <input class="auto" appAutofocus />
  `,
})
class DirectHostComponent {}

@Component({
  imports: [AutofocusDirective],
  template: `<input class="auto" appAutofocus disabled /><input class="other" />`,
})
class DisabledHostComponent {}

@Component({
  imports: [AutofocusDirective],
  template: `<div class="wrapper" appAutofocus><input class="inner" /></div>`,
})
class WrapperHostComponent {}

async function mount(type: Type<unknown>) {
  const fixture = TestBed.createComponent(type)
  const host = fixture.nativeElement as HTMLElement
  document.body.append(host)
  await fixture.whenStable()
  return host
}

describe('AutofocusDirective', () => {
  it('focuses its element after the first render', async () => {
    const element = await mount(DirectHostComponent)
    expect(document.activeElement).toBe(element.querySelector('.auto'))
  })

  it('focuses the first control inside a wrapper', async () => {
    const element = await mount(WrapperHostComponent)
    expect(document.activeElement).toBe(element.querySelector('.inner'))
  })

  it('skips a disabled element', async () => {
    const element = await mount(DisabledHostComponent)
    expect(document.activeElement).not.toBe(element.querySelector('.auto'))
  })
})
