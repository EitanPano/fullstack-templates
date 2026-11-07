import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'

import { provideTestTranslator } from '@app/core/i18n/translator.testing'

import { FormActionsComponent } from './form-actions.component'

@Component({
  imports: [FormActionsComponent],
  template: `<app-form-actions
    [pending]="pending()"
    [cancellable]="cancellable()"
    submitKey="modal.confirm"
    (cancelled)="cancels = cancels + 1"
  />`,
})
class HostComponent {
  pending = signal(false)
  cancellable = signal(false)
  cancels = 0
}

async function render() {
  TestBed.configureTestingModule({ providers: [provideTestTranslator()] })
  const fixture = TestBed.createComponent(HostComponent)
  await fixture.whenStable()
  const element = fixture.nativeElement as HTMLElement
  const buttons = () => [...element.querySelectorAll('button')] as HTMLButtonElement[]
  return { fixture, element, buttons, host: fixture.componentInstance }
}

describe('FormActionsComponent', () => {
  it('renders a translated submit button of type submit and no cancel by default', async () => {
    const { buttons } = await render()
    expect(buttons()).toHaveLength(1)
    expect(buttons()[0].type).toBe('submit')
    expect(buttons()[0].textContent).toContain('Confirm')
  })

  it('shows a cancel button that emits cancelled', async () => {
    const { fixture, buttons, host } = await render()
    host.cancellable.set(true)
    await fixture.whenStable()
    expect(buttons()).toHaveLength(2)
    expect(buttons()[1].type).toBe('button')
    expect(buttons()[1].textContent).toContain('Cancel')
    buttons()[1].click()
    expect(host.cancels).toBe(1)
  })

  it('disables the buttons and shows the spinner while pending', async () => {
    const { fixture, element, buttons, host } = await render()
    host.cancellable.set(true)
    host.pending.set(true)
    await fixture.whenStable()
    expect(buttons()[0].disabled).toBe(true)
    expect(buttons()[0].getAttribute('aria-busy')).toBe('true')
    expect(buttons()[1].disabled).toBe(true)
    expect(element.querySelector('.spinner')).not.toBeNull()
    buttons()[1].click()
    expect(host.cancels).toBe(0)
  })
})
