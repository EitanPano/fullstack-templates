import { TestBed } from '@angular/core/testing'

import { provideTestTranslator } from '@app/core/i18n/translator.testing'

import { ErrorStateComponent } from './error-state.component'

describe('ErrorStateComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTestTranslator()] })
  })

  it('shows the generic copy and emits retry from the button', async () => {
    const fixture = TestBed.createComponent(ErrorStateComponent)
    const retries: unknown[] = []
    fixture.componentInstance.retry.subscribe(() => retries.push(1))
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement
    expect(element.querySelector('[role="alert"]')).not.toBeNull()
    expect(element.querySelector('h2')?.textContent).toBe('Something went wrong')
    element.querySelector('button')?.click()
    expect(retries.length).toBe(1)
  })

  it('shows given copy and no retry button when not retryable', async () => {
    const fixture = TestBed.createComponent(ErrorStateComponent)
    fixture.componentRef.setInput('heading', 'Plant not found')
    fixture.componentRef.setInput('description', 'It was removed')
    fixture.componentRef.setInput('retryable', false)
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement
    expect(element.querySelector('h2')?.textContent).toBe('Plant not found')
    expect(element.querySelector('.error-state__description')?.textContent).toBe('It was removed')
    expect(element.querySelector('button')).toBeNull()
  })
})
