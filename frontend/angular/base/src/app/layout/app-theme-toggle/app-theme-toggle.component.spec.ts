import { TestBed } from '@angular/core/testing'

import { provideTestTranslator } from '@app/core/i18n/translator.testing'
import { ThemeService } from '@app/core/providers/theme.service'

import { AppThemeToggleComponent } from './app-theme-toggle.component'

describe('AppThemeToggleComponent', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('cycles the theme from the toggle and announces the new state', async () => {
    TestBed.configureTestingModule({ providers: [provideTestTranslator()] })
    const fixture = TestBed.createComponent(AppThemeToggleComponent)
    const element = fixture.nativeElement as HTMLElement
    const theme = TestBed.inject(ThemeService)
    theme.set('light')
    await fixture.whenStable()
    const toggle = element.querySelector<HTMLButtonElement>('button')
    expect(toggle?.getAttribute('aria-label')).toBe('Theme: Light. Switch to Dark.')
    toggle?.click()
    await fixture.whenStable()
    expect(theme.preference()).toBe('dark')
    expect(toggle?.getAttribute('aria-label')).toBe('Theme: Dark. Switch to System.')
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Dark theme')
  })
})
