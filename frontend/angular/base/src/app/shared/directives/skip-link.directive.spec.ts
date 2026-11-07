import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'

import { SkipLinkDirective } from './skip-link.directive'

@Component({
  imports: [SkipLinkDirective],
  template: `
    <a appSkipLink href="#main">Skip</a>
    <a appSkipLink href="#missing">Nowhere</a>
    <main id="main" tabindex="-1">Content</main>
  `,
})
class HostComponent {}

async function render() {
  const fixture = TestBed.createComponent(HostComponent)
  await fixture.whenStable()
  document.body.appendChild(fixture.nativeElement as HTMLElement)
  return fixture.nativeElement as HTMLElement
}

describe('SkipLinkDirective', () => {
  it('moves focus to the named element and cancels the navigation', async () => {
    const element = await render()
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })

    element.querySelector('a')?.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(element.querySelector('main'))
    element.remove()
  })

  it('leaves the click alone when the target does not exist', async () => {
    const element = await render()
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })

    element.querySelector('a[href="#missing"]')?.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    element.remove()
  })
})
