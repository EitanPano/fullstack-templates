import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router, provideRouter } from '@angular/router'

import { NAV_ENTRIES } from '@app/core/config/nav.token'
import { provideTestTranslator } from '@app/core/i18n/translator.testing'
import type { NavEntry } from '@app/models/nav/interface'
import { ROLES } from '@app/shared/directives/has-role.directive'

import { AppSideNavComponent } from './app-side-nav.component'

@Component({ template: '' })
class PageComponent {}

const entries: NavEntry[] = [
  { path: '/', labelKey: 'nav.primary' },
  { path: '/other', labelKey: 'nav.open' },
]

async function render(open = false, nav: NavEntry[] = entries, roles: string[] = []) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: '', component: PageComponent },
        { path: 'other', component: PageComponent },
      ]),
      provideTestTranslator(),
      { provide: NAV_ENTRIES, useValue: nav },
      { provide: ROLES, useValue: signal(roles) },
    ],
  })
  const fixture = TestBed.createComponent(AppSideNavComponent)
  fixture.componentRef.setInput('open', open)
  const closed: unknown[] = []
  fixture.componentInstance.open.subscribe((value) => {
    if (!value) closed.push(1)
  })
  await fixture.whenStable()
  return { fixture, element: fixture.nativeElement as HTMLElement, closed }
}

describe('AppSideNavComponent', () => {
  it('renders a labelled primary nav with one translated link per NAV entry', async () => {
    const { element } = await render()
    const nav = element.querySelector('nav')
    expect(nav?.getAttribute('aria-label')).toBe('Primary')
    expect(nav?.id).toBe('side-nav')
    const links = Array.from(element.querySelectorAll('a'))
    expect(links.map((link) => link.textContent)).toEqual(['Primary', 'Open navigation'])
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/', '/other'])
  })

  it('shows an entry with roles only to an account that holds one of them', async () => {
    const nav: NavEntry[] = [
      ...entries,
      { path: '/admin', labelKey: 'nav.close', roles: ['admin'] },
    ]
    const visitor = await render(false, nav, [])
    expect(visitor.element.querySelectorAll('a')).toHaveLength(2)
    TestBed.resetTestingModule()
    const user = await render(false, nav, ['user'])
    expect(user.element.querySelectorAll('a')).toHaveLength(2)
    TestBed.resetTestingModule()
    const admin = await render(false, nav, ['admin'])
    expect(
      Array.from(admin.element.querySelectorAll('a')).map((link) => link.getAttribute('href')),
    ).toEqual(['/', '/other', '/admin'])
  })

  it('marks the active route with aria-current=page', async () => {
    const { fixture, element } = await render()
    await TestBed.inject(Router).navigateByUrl('/other')
    await fixture.whenStable()
    const current = Array.from(element.querySelectorAll('a[aria-current="page"]'))
    expect(current.map((link) => link.getAttribute('href'))).toEqual(['/other'])
  })

  it('is open or closed by the open input and has a backdrop only when open', async () => {
    const { fixture, element } = await render(true)
    expect(element.querySelector('nav')?.classList.contains('is-open')).toBe(true)
    expect(element.querySelector('.side-nav-backdrop')).not.toBeNull()
    fixture.componentRef.setInput('open', false)
    await fixture.whenStable()
    expect(element.querySelector('nav')?.classList.contains('is-open')).toBe(false)
    expect(element.querySelector('.side-nav-backdrop')).toBeNull()
  })

  it('asks to close on Escape, on the close button, on the backdrop and after navigation', async () => {
    const { fixture, element, closed } = await render(true)
    // Closing sets the model to false, so each trigger starts from an open drawer.
    const reopen = async () => {
      fixture.componentInstance.open.set(true)
      await fixture.whenStable()
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(closed.length).toBe(1)
    await reopen()
    element.querySelector<HTMLButtonElement>('.side-nav__close button')?.click()
    expect(closed.length).toBe(2)
    await reopen()
    element.querySelector<HTMLElement>('.side-nav-backdrop')?.click()
    expect(closed.length).toBe(3)
    await reopen()
    await TestBed.inject(Router).navigateByUrl('/other')
    await fixture.whenStable()
    expect(closed.length).toBe(4)
  })

  it('does not ask to close when it is already closed', async () => {
    const { closed } = await render(false)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(closed.length).toBe(0)
  })

  describe('two-way binding of open', () => {
    @Component({
      imports: [AppSideNavComponent],
      template: '<app-side-nav [(open)]="drawer" />',
    })
    class DrawerHostComponent {
      readonly drawer = signal(false)
    }

    function renderHost() {
      TestBed.configureTestingModule({
        providers: [
          provideRouter([{ path: '', component: PageComponent }]),
          provideTestTranslator(),
          { provide: NAV_ENTRIES, useValue: entries },
          { provide: ROLES, useValue: signal([]) },
        ],
      })
      const fixture = TestBed.createComponent(DrawerHostComponent)
      return { fixture, element: fixture.nativeElement as HTMLElement }
    }

    it("flips the parent's signal when the drawer closes itself", async () => {
      const { fixture, element } = renderHost()
      fixture.componentInstance.drawer.set(true)
      await fixture.whenStable()
      expect(element.querySelector('nav')?.classList.contains('is-open')).toBe(true)
      element.querySelector<HTMLElement>('.side-nav-backdrop')?.click()
      await fixture.whenStable()
      expect(fixture.componentInstance.drawer()).toBe(false)
      expect(element.querySelector('nav')?.classList.contains('is-open')).toBe(false)
    })

    it('opens when the parent sets the signal and leaves it alone when already closed', async () => {
      const { fixture, element } = renderHost()
      await fixture.whenStable()
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await fixture.whenStable()
      expect(fixture.componentInstance.drawer()).toBe(false)
      fixture.componentInstance.drawer.set(true)
      await fixture.whenStable()
      expect(element.querySelector('nav')?.classList.contains('is-open')).toBe(true)
    })
  })
})
