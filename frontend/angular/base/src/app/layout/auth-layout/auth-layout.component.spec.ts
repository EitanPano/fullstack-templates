import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'

import { DISPLAY_NAME } from '@app/core/config/constants'
import { provideTestTranslator } from '@app/core/i18n/translator.testing'

import { AuthLayoutComponent } from './auth-layout.component'

describe('AuthLayoutComponent', () => {
  async function render() {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideTestTranslator()] })
    const fixture = TestBed.createComponent(AuthLayoutComponent)
    await fixture.whenStable()
    return fixture.nativeElement as HTMLElement
  }

  it('has a skip link, one main, the product name linking home and a footer', async () => {
    const element = await render()
    expect(element.querySelector('a.skip-link')?.getAttribute('href')).toBe('#main')
    expect(element.querySelectorAll('main#main')).toHaveLength(1)
    const brand = element.querySelector('a.auth-layout__brand')
    expect(brand?.getAttribute('href')).toBe('/')
    expect(brand?.textContent).toBe(DISPLAY_NAME)
    expect(element.querySelector('footer')).not.toBeNull()
  })

  it('has no navigation landmark', async () => {
    const element = await render()
    expect(element.querySelector('nav')).toBeNull()
  })
})
