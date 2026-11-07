import { Component, TemplateRef, ViewChild, inject } from '@angular/core'
import { TestBed } from '@angular/core/testing'

import { provideTestTranslator } from '@app/core/i18n/translator.testing'

import { ModalService } from './modal.service'
import { MODAL_DATA, MODAL_REF, type ModalRef } from './modal.tokens'

@Component({ template: '<p class="probe">{{ data }}</p>' })
class ProbeComponent {
  data = inject(MODAL_DATA)
  ref = inject(MODAL_REF) as ModalRef<string>
}

@Component({
  template: `<button type="button" class="opener">Open</button>
    <ng-template #tpl let-data let-ref="ref"
      ><input class="inside" /><span class="tpl">{{ data }}</span></ng-template
    >`,
})
class HostComponent {
  @ViewChild('tpl', { static: true }) template!: TemplateRef<never>
}

function escape() {
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }),
  )
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')

async function setup() {
  TestBed.configureTestingModule({ providers: [provideTestTranslator()] })
  const fixture = TestBed.createComponent(HostComponent)
  await fixture.whenStable()
  const host = fixture.nativeElement as HTMLElement
  const opener = host.querySelector('.opener') as HTMLElement
  document.body.append(host)
  opener.focus()
  return { fixture, opener, service: TestBed.inject(ModalService) }
}

describe('ModalService', () => {
  afterEach(() => {
    TestBed.inject(ModalService)
    document.querySelectorAll('.cdk-overlay-container').forEach((node) => (node.innerHTML = ''))
  })

  it('opens a labelled modal dialog around a component and hands it its data', async () => {
    const { fixture, service } = await setup()
    const ref = service.open<string, string>(ProbeComponent, {
      titleKey: 'notFound.title',
      size: 'lg',
      data: 'payload',
    })
    await fixture.whenStable()
    const panel = dialog() as HTMLElement
    expect(panel.getAttribute('aria-modal')).toBe('true')
    const title = document.getElementById(panel.getAttribute('aria-labelledby') as string)
    expect(title?.textContent).toBe('Page not found')
    expect(document.querySelector('.probe')?.textContent).toBe('payload')
    expect(document.querySelector('.modal__panel--lg')).not.toBeNull()
    ref.close('x')
  })

  it('renders a template with the data and a ref, and resolves closed with the result', async () => {
    const { fixture, service } = await setup()
    const ref = service.open<string, string>(fixture.componentInstance.template, {
      titleKey: 'notFound.title',
      data: 'from-template',
    })
    await fixture.whenStable()
    expect(document.querySelector('.tpl')?.textContent).toBe('from-template')
    let result: string | undefined = 'unset'
    ref.closed.subscribe((value) => (result = value))
    ref.close('done')
    await fixture.whenStable()
    expect(result).toBe('done')
    expect(dialog()).toBeNull()
  })

  it('closes on Escape and gives focus back to the opener', async () => {
    const { fixture, opener, service } = await setup()
    service.open(fixture.componentInstance.template, { titleKey: 'notFound.title' })
    await fixture.whenStable()
    expect(dialog()?.contains(document.activeElement)).toBe(true)
    escape()
    await fixture.whenStable()
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('keeps focus inside while open: the dialog container holds a focus trap', async () => {
    const { fixture, service } = await setup()
    service.open(fixture.componentInstance.template, { titleKey: 'notFound.title' })
    await fixture.whenStable()
    expect(document.querySelector('.cdk-dialog-container')).not.toBeNull()
    expect(dialog()?.contains(document.activeElement)).toBe(true)
    expect(document.querySelector('.cdk-focus-trap-anchor')).not.toBeNull()
    escape()
  })

  it('closes from the close button', async () => {
    const { fixture, service } = await setup()
    service.open(fixture.componentInstance.template, { titleKey: 'notFound.title' })
    await fixture.whenStable()
    const close = document.querySelector('.modal__header button') as HTMLButtonElement
    expect(close.getAttribute('aria-label')).toBe('Close')
    close.click()
    await fixture.whenStable()
    expect(dialog()).toBeNull()
  })

  it('closes on a backdrop click', async () => {
    const { fixture, service } = await setup()
    service.open(fixture.componentInstance.template, { titleKey: 'notFound.title' })
    await fixture.whenStable()
    ;(document.querySelector('.modal__backdrop') as HTMLElement).click()
    await fixture.whenStable()
    expect(dialog()).toBeNull()
  })

  describe('confirm', () => {
    const options = { titleKey: 'notFound.title', messageKey: 'errors.unexpected' }

    it('resolves true on confirm and shows the message and a danger button', async () => {
      const { fixture, service } = await setup()
      const answer = service.confirm({ ...options, danger: true, confirmKey: 'actions.retry' })
      await fixture.whenStable()
      expect(document.querySelector('.modal__message')?.textContent).toContain('went wrong')
      const buttons = [...document.querySelectorAll('.modal__actions button')] as HTMLElement[]
      expect(buttons.map((b) => b.textContent.trim())).toEqual(['Cancel', 'Try again'])
      expect(buttons[1].classList.contains('button--danger')).toBe(true)
      buttons[1].click()
      expect(await answer).toBe(true)
    })

    it('resolves false on cancel', async () => {
      const { fixture, service } = await setup()
      const answer = service.confirm(options)
      await fixture.whenStable()
      const buttons = [...document.querySelectorAll('.modal__actions button')] as HTMLElement[]
      expect(buttons[1].textContent.trim()).toBe('Confirm')
      expect(buttons[1].classList.contains('button--primary')).toBe(true)
      buttons[0].click()
      expect(await answer).toBe(false)
    })

    it('resolves false on Escape', async () => {
      const { fixture, service } = await setup()
      const answer = service.confirm(options)
      await fixture.whenStable()
      escape()
      expect(await answer).toBe(false)
    })
  })
})
