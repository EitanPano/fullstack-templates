import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'

import { NAV_ENTRIES } from '@app/core/config/nav.token'
import { provideTestTranslator } from '@app/core/i18n/translator.testing'
import { NAV } from '@app/nav'

import { AppMainLayoutComponent } from './app-main-layout.component'

type Listener = (event: { matches: boolean }) => void

async function render(wide = false) {
  const listeners: Listener[] = []
  vi.stubGlobal('matchMedia', () => ({
    matches: wide,
    addEventListener: (_: string, listener: Listener) => {
      listeners.push(listener)
    },
    removeEventListener: (_: string, listener: Listener) => {
      listeners.splice(listeners.indexOf(listener), 1)
    },
  }))
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideTestTranslator(),
      { provide: NAV_ENTRIES, useValue: NAV },
    ],
  })
  const fixture = TestBed.createComponent(AppMainLayoutComponent)
  await fixture.whenStable()
  return { fixture, element: fixture.nativeElement as HTMLElement, listeners }
}

describe('AppMainLayoutComponent', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('has the landmarks: banner, primary nav, one main, footer', async () => {
    const { element } = await render()
    expect(element.querySelectorAll('header').length).toBe(1)
    expect(element.querySelectorAll('nav[aria-label="Primary"]').length).toBe(1)
    expect(element.querySelectorAll('main').length).toBe(1)
    expect(element.querySelector('main')?.id).toBe('main')
    expect(element.querySelectorAll('footer').length).toBe(1)
    expect(element.querySelector('main router-outlet')).not.toBeNull()
  })

  it('puts the skip link first in tab order, pointing at main', async () => {
    const { element } = await render()
    const focusable = element.querySelector('a, button')
    expect(focusable?.classList.contains('skip-link')).toBe(true)
    expect(focusable?.getAttribute('href')).toBe('#main')
    expect(focusable?.textContent).toBe('Skip to content')
  })

  it('renders one link per NAV entry', async () => {
    const { element } = await render()
    expect(element.querySelectorAll('.side-nav__link').length).toBe(NAV.length)
  })

  it('opens the drawer: focus moves into the nav and the page behind is inert', async () => {
    const { fixture, element } = await render()
    const nav = element.querySelector('nav#side-nav')
    const toggle = element.querySelector<HTMLButtonElement>('.header__nav-toggle button')
    toggle?.focus()
    toggle?.click()
    await fixture.whenStable()
    expect(nav?.classList.contains('is-open')).toBe(true)
    expect(toggle?.getAttribute('aria-expanded')).toBe('true')
    expect(nav?.contains(document.activeElement)).toBe(true)
    expect(element.querySelector('main')?.hasAttribute('inert')).toBe(true)
    expect(element.querySelector('app-footer')?.hasAttribute('inert')).toBe(true)
  })

  it('closes on Escape, returns focus to the toggle and makes the page live again', async () => {
    const { fixture, element } = await render()
    const nav = element.querySelector('nav#side-nav')
    const toggle = element.querySelector<HTMLButtonElement>('.header__nav-toggle button')
    toggle?.focus()
    toggle?.click()
    await fixture.whenStable()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await fixture.whenStable()
    expect(nav?.classList.contains('is-open')).toBe(false)
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(toggle)
    expect(element.querySelector('main')?.hasAttribute('inert')).toBe(false)
  })

  it('closes the drawer when the viewport grows to lg, and stops listening on destroy', async () => {
    const { fixture, element, listeners } = await render()
    element.querySelector<HTMLButtonElement>('.header__nav-toggle button')?.click()
    await fixture.whenStable()
    expect(element.querySelector('nav#side-nav')?.classList.contains('is-open')).toBe(true)
    listeners.forEach((listener) => {
      listener({ matches: true })
    })
    await fixture.whenStable()
    expect(element.querySelector('nav#side-nav')?.classList.contains('is-open')).toBe(false)
    const before = listeners.length
    fixture.destroy()
    expect(listeners.length).toBe(before - 1)
  })

  it('never makes the page inert when the nav is a column', async () => {
    const { fixture, element } = await render(true)
    element.querySelector<HTMLButtonElement>('.header__nav-toggle button')?.click()
    await fixture.whenStable()
    expect(element.querySelector('main')?.hasAttribute('inert')).toBe(false)
  })
})
