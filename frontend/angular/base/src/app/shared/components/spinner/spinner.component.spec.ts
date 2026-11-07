import { TestBed } from '@angular/core/testing'

import { provideTestTranslator } from '@app/core/i18n/translator.testing'

import { SpinnerComponent } from './spinner.component'

describe('SpinnerComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTestTranslator()] })
  })

  it('is a status region with a translated label', async () => {
    const fixture = TestBed.createComponent(SpinnerComponent)
    await fixture.whenStable()
    const status = (fixture.nativeElement as HTMLElement).querySelector('[role="status"]')
    expect(status?.textContent).toContain('Loading')
  })

  it('is silent when decorative', async () => {
    const fixture = TestBed.createComponent(SpinnerComponent)
    fixture.componentRef.setInput('decorative', true)
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement
    expect(element.querySelector('[role="status"]')).toBeNull()
    expect(element.querySelector('.spinner')?.getAttribute('aria-hidden')).toBe('true')
  })
})
