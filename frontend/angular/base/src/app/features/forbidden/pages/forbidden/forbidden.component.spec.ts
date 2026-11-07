import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'

import { provideTestTranslator } from '@app/core/i18n/translator.testing'

import { ForbiddenComponent } from './forbidden.component'

describe('ForbiddenComponent', () => {
  it('has one h1 and a link home', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideTestTranslator()] })
    const fixture = TestBed.createComponent(ForbiddenComponent)
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement
    expect(element.querySelectorAll('h1')).toHaveLength(1)
    expect(element.querySelector('h1')?.textContent).toBe('No access')
    expect(element.querySelector('a')?.getAttribute('href')).toBe('/')
  })
})
