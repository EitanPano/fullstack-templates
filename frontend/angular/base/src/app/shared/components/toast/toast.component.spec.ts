import { TestBed } from '@angular/core/testing'

import { provideTestTranslator } from '@app/core/i18n/translator.testing'
import type { Toast } from '@app/models/notification/interface'

import { ToastComponent } from './toast.component'

const toasts: Toast[] = [
  {
    id: 1,
    kind: 'success',
    messageKey: 'shell.footer',
    params: { year: 2026, name: 'App' },
    timeoutMs: 1,
  },
  { id: 2, kind: 'error', messageKey: 'errors.unexpected', timeoutMs: 1 },
]

describe('ToastComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTestTranslator()] })
  })

  it('lists each toast translated, errors as alerts and the rest as status', async () => {
    const fixture = TestBed.createComponent(ToastComponent)
    fixture.componentRef.setInput('toasts', toasts)
    await fixture.whenStable()
    const items = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.toast'))
    expect(items.map((item) => item.getAttribute('role'))).toEqual(['status', 'alert'])
    expect(items[0].textContent).toContain('© 2026 App')
    expect(items[1].textContent).toContain('Something went wrong')
  })

  it('emits the id of the toast whose dismiss button is pressed', async () => {
    const fixture = TestBed.createComponent(ToastComponent)
    const ids: number[] = []
    fixture.componentInstance.dismissed.subscribe((id) => ids.push(id))
    fixture.componentRef.setInput('toasts', toasts)
    await fixture.whenStable()
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll('button')
    expect(buttons[1].getAttribute('aria-label')).toBe('Dismiss')
    buttons[1].click()
    expect(ids).toEqual([2])
  })

  it('reports held while hovered or focused, released only when neither remains', async () => {
    const fixture = TestBed.createComponent(ToastComponent)
    const states: boolean[] = []
    fixture.componentInstance.held.subscribe((held) => states.push(held))
    await fixture.whenStable()
    const list = (fixture.nativeElement as HTMLElement).querySelector('.toast-list')
    list?.dispatchEvent(new MouseEvent('mouseenter'))
    list?.dispatchEvent(new FocusEvent('focusin'))
    list?.dispatchEvent(new MouseEvent('mouseleave'))
    list?.dispatchEvent(new FocusEvent('focusout'))
    expect(states).toEqual([true, false])
  })

  it('renders an empty live region for an empty queue', async () => {
    const fixture = TestBed.createComponent(ToastComponent)
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement
    expect(element.querySelector('[aria-live="polite"]')).not.toBeNull()
    expect(element.querySelectorAll('.toast').length).toBe(0)
  })

  it('runs a toast action, then dismisses that toast', async () => {
    const fixture = TestBed.createComponent(ToastComponent)
    const ids: number[] = []
    const run = vi.fn()
    fixture.componentInstance.dismissed.subscribe((id) => ids.push(id))
    fixture.componentRef.setInput('toasts', [
      {
        id: 7,
        kind: 'info',
        messageKey: 'errors.title',
        action: { labelKey: 'actions.retry', run },
        timeoutMs: 0,
      },
    ])
    await fixture.whenStable()
    const action = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.toast__action button',
    )
    expect(action?.textContent.trim()).toBe('Try again')
    action?.click()
    expect(run).toHaveBeenCalledOnce()
    expect(ids).toEqual([7])
  })
})
