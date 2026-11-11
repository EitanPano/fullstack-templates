import { TestBed } from '@angular/core/testing'

import { LanguageService } from '@app/core/i18n/language.service'
import { provideTestTranslator } from '@app/core/i18n/translator.testing'

import { AppLanguageToggleComponent } from './app-language-toggle.component'

async function render() {
  TestBed.configureTestingModule({ providers: [provideTestTranslator()] })
  const fixture = TestBed.createComponent(AppLanguageToggleComponent)
  await fixture.whenStable()
  return { fixture, element: fixture.nativeElement as HTMLElement }
}

describe('AppLanguageToggleComponent', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    document.documentElement.setAttribute('dir', 'ltr')
    document.documentElement.setAttribute('lang', 'en')
  })

  it('shows the other language as the toggle and announces the current one', async () => {
    const { element } = await render()
    const toggle = element.querySelector<HTMLButtonElement>('button')
    expect(toggle?.textContent.trim()).toBe('עברית')
    expect(toggle?.getAttribute('aria-label')).toBe('Switch language to עברית')
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Language: English')
  })

  it('switches the language and the direction from the toggle', async () => {
    const { fixture, element } = await render()
    const language = TestBed.inject(LanguageService)
    element.querySelector<HTMLButtonElement>('button')?.click()
    await vi.waitFor(() => {
      expect(language.lang()).toBe('he')
    })
    await fixture.whenStable()
    expect(document.documentElement.getAttribute('dir')).toBe('rtl')
    expect(element.querySelector('button')?.textContent.trim()).toBe('English')
    expect(element.querySelector('[role="status"]')?.textContent).toContain('שפה: עברית')
  })
})
