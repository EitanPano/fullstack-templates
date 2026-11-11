import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'

import { provideTestTranslator } from '@app/core/i18n/translator.testing'
import type { PublicUser } from '@app/models/user/type'
import { AuthStore } from '@app/store/auth.store'

import { AppAccountMenuComponent } from './app-account-menu.component'

const logout = vi.fn<() => Promise<boolean>>(() => Promise.resolve(true))
const user = signal<PublicUser | null>(null)

async function render(account: PublicUser | null) {
  logout.mockClear()
  user.set(account)
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideTestTranslator(),
      { provide: AuthStore, useValue: { user, isLoggedIn: () => user() !== null, logout } },
    ],
  })
  const fixture = TestBed.createComponent(AppAccountMenuComponent)
  await fixture.whenStable()
  return { fixture, element: fixture.nativeElement as HTMLElement }
}

const ACCOUNT = { id: '1', email: 'ada@example.com', role: 'user' } as PublicUser

describe('AppAccountMenuComponent', () => {
  it('shows a sign-in link to a visitor and no menu', async () => {
    const { element } = await render(null)
    expect(element.querySelector('a')?.getAttribute('href')).toBe('/auth/login')
    expect(element.querySelector('.user-menu')).toBeNull()
  })

  it('shows the avatar of a signed-in account, closed, and opens the menu from it', async () => {
    const { fixture, element } = await render(ACCOUNT)
    expect(element.querySelector('.avatar')?.getAttribute('data-initials')).toBe('AD')
    expect(element.querySelector('a[href="/auth/login"]')).toBeNull()
    const trigger = element.querySelector<HTMLButtonElement>('.user-menu__trigger button')
    expect(trigger?.getAttribute('aria-expanded')).toBe('false')
    expect(element.querySelector('#user-menu')).toBeNull()
    trigger?.click()
    await fixture.whenStable()
    expect(trigger?.getAttribute('aria-expanded')).toBe('true')
    const panel = element.querySelector('#user-menu')
    expect(panel?.textContent).toContain('ada@example.com')
    expect(panel?.querySelector('a')?.getAttribute('href')).toBe('/profile')
  })

  it('signs out from the menu and closes it', async () => {
    const { fixture, element } = await render(ACCOUNT)
    element.querySelector<HTMLButtonElement>('.user-menu__trigger button')?.click()
    await fixture.whenStable()
    const buttons = Array.from(element.querySelectorAll<HTMLButtonElement>('#user-menu button'))
    buttons.find((button) => button.textContent.includes('Sign out'))?.click()
    await fixture.whenStable()
    expect(logout).toHaveBeenCalledOnce()
    expect(element.querySelector('#user-menu')).toBeNull()
  })

  it('closes on Escape', async () => {
    const { fixture, element } = await render(ACCOUNT)
    element.querySelector<HTMLButtonElement>('.user-menu__trigger button')?.click()
    await fixture.whenStable()
    element
      .querySelector('.user-menu')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await fixture.whenStable()
    expect(element.querySelector('#user-menu')).toBeNull()
  })
})
