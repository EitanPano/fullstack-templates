import { TestBed } from '@angular/core/testing'

import { DISPLAY_NAME } from '@app/core/config/constants'
import { provideTestTranslator } from '@app/core/i18n/translator.testing'

import { HomeComponent } from './home.component'

// The page injects no service or store, so it makes no data call; renders with no provider but the
// translator.
describe('HomeComponent', () => {
  it('shows the display name as its one h1 inside the page container, and one line of copy', async () => {
    TestBed.configureTestingModule({ providers: [provideTestTranslator()] })
    const fixture = TestBed.createComponent(HomeComponent)
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement
    expect(element.querySelectorAll('h1')).toHaveLength(1)
    expect(element.querySelector('app-page h1')?.textContent).toBe(DISPLAY_NAME)
    expect(element.textContent).toContain('Replace this page with the first screen.')
  })
})
