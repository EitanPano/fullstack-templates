import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'

import { provideTestTranslator } from '@app/core/i18n/translator.testing'

import { NotFoundComponent } from './not-found.component'

describe('NotFoundComponent', () => {
  it('has one h1 and a link home', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideTestTranslator()] })
    const fixture = TestBed.createComponent(NotFoundComponent)
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement
    expect(element.querySelectorAll('h1').length).toBe(1)
    expect(element.querySelector('h1')?.textContent).toBe('Page not found')
    const home = element.querySelector('a')
    expect(home?.getAttribute('href')).toBe('/')
    expect(home?.textContent).toContain('Back to the home page')
  })
})
