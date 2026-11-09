import { TestBed } from '@angular/core/testing'

import { DISPLAY_NAME } from '@app/core/config/constants'
import { provideTestTranslator } from '@app/core/i18n/translator.testing'

import { AppFooterComponent } from './app-footer.component'

describe('AppFooterComponent', () => {
  it('shows the current year and the product name in a contentinfo footer', async () => {
    TestBed.configureTestingModule({ providers: [provideTestTranslator()] })
    const fixture = TestBed.createComponent(AppFooterComponent)
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement
    expect(element.querySelector('footer')).not.toBeNull()
    expect(element.textContent).toContain(String(new Date().getFullYear()))
    expect(element.textContent).toContain(DISPLAY_NAME)
  })
})
