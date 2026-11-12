import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'

import { DISPLAY_NAME } from '@app/core/config/constants'
import { provideTestTranslator } from '@app/core/i18n/translator.testing'

import { AppAuthLayoutComponent } from './app-auth-layout.component'

describe('AppAuthLayoutComponent', () => {
  async function render() {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideTestTranslator()] })
    const fixture = TestBed.createComponent(AppAuthLayoutComponent)
    await fixture.whenStable()
    return fixture.nativeElement as HTMLElement
  }

  it('has a skip link, one main and the product name linking home', async () => {
    const element = await render()
    expect(element.querySelector('a.skip-link')?.getAttribute('href')).toBe('#main')
    expect(element.querySelectorAll('main#main')).toHaveLength(1)
    const brand = element.querySelector('a.auth-layout__brand')
    expect(brand?.getAttribute('href')).toBe('/')
    expect(brand?.textContent).toBe(DISPLAY_NAME)
  })

  it('has no navigation or footer landmark', async () => {
    const element = await render()
    expect(element.querySelector('nav, footer')).toBeNull()
  })
})
