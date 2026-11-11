import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router, provideRouter } from '@angular/router'

import { provideTestTranslator } from '@app/core/i18n/translator.testing'

import { AppMainLayoutComponent } from './app-main-layout.component'

@Component({ template: '<p id="content">Hello</p>' })
class PlainPageComponent {}

async function render() {
  TestBed.configureTestingModule({
    providers: [provideRouter([{ path: '', component: PlainPageComponent }]), provideTestTranslator()],
  })
  const fixture = TestBed.createComponent(AppMainLayoutComponent)
  await TestBed.inject(Router).navigateByUrl('/')
  await fixture.whenStable()
  return fixture.nativeElement as HTMLElement
}

describe('AppMainLayoutComponent', () => {
  it('puts the skip link first, pointing at the one main that holds the route outlet', async () => {
    const element = await render()
    const skip = element.querySelector('a, button')
    expect(skip?.classList.contains('skip-link')).toBe(true)
    expect(skip?.getAttribute('href')).toBe('#main')
    expect(skip?.textContent).toBe('Skip to content')

    const mains = element.querySelectorAll('main')
    expect(mains).toHaveLength(1)
    expect(mains[0].id).toBe('main')
    expect(mains[0].getAttribute('tabindex')).toBe('-1')
    expect(mains[0].querySelector('#content')?.textContent).toBe('Hello')
    // The skip link comes before main in the document, so it is first in the tab order.
    expect(skip?.compareDocumentPosition(mains[0])).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('renders no banner, navigation or contentinfo landmark and no brand text', async () => {
    const element = await render()
    expect(element.querySelector('header, nav, footer, [role="banner"], [role="navigation"]')).toBeNull()
    expect(element.querySelector('[role="contentinfo"]')).toBeNull()
    expect(element.textContent.replace('Skip to content', '').trim()).toBe('Hello')
  })
})
