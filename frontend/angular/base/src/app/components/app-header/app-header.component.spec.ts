import { signal } from '@angular/core' // @server:auth
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'

import { DISPLAY_NAME } from '@app/core/config/constants'
import { provideTestTranslator } from '@app/core/i18n/translator.testing'
import { ThemeService } from '@app/core/providers/theme.service'
import { LanguageService } from '@app/core/i18n/language.service' // @i18n
import type { PublicUser } from '@app/models/user/interface' // @server:auth
import { AuthStore } from '@app/store/auth.store' // @server:auth

import { HeaderComponent } from './header.component'

async function render(navOpen = false) {
  TestBed.configureTestingModule({ providers: [provideRouter([]), provideTestTranslator()] })
  const fixture = TestBed.createComponent(HeaderComponent)
  fixture.componentRef.setInput('navOpen', navOpen)
  await fixture.whenStable()
  return { fixture, element: fixture.nativeElement as HTMLElement }
}

function statusText(element: HTMLElement): string {
  return Array.from(element.querySelectorAll('[role="status"].visually-hidden'))
    .map((node) => node.textContent)
    .join(' ')
}

describe('HeaderComponent', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows the product name as a link home', async () => {
    const { element } = await render()
    const brand = element.querySelector('a.header__brand')
    expect(brand?.getAttribute('href')).toBe('/')
    expect(brand?.textContent).toBe(DISPLAY_NAME)
  })

  it('cycles the theme from the toggle and announces the new state', async () => {
    const { fixture, element } = await render()
    const theme = TestBed.inject(ThemeService)
    theme.set('light')
    await fixture.whenStable()
    const toggle = element.querySelector<HTMLButtonElement>('.header__theme button')
    expect(toggle?.getAttribute('aria-label')).toBe('Theme: Light. Switch to Dark.')
    toggle?.click()
    await fixture.whenStable()
    expect(theme.preference()).toBe('dark')
    expect(toggle?.getAttribute('aria-label')).toBe('Theme: Dark. Switch to System.')
    expect(statusText(element)).toContain('Dark theme')
  })

  it('shows the offline badge only while offline', async () => {
    const { fixture, element } = await render()
    expect(element.querySelector('.badge')).toBeNull()
    window.dispatchEvent(new Event('offline'))
    await fixture.whenStable()
    expect(element.querySelector('.badge')?.textContent).toContain('Offline')
    window.dispatchEvent(new Event('online'))
    await fixture.whenStable()
    expect(element.querySelector('.badge')).toBeNull()
  })

  it('has a nav toggle that reports its state and emits navToggle', async () => {
    const { fixture, element } = await render(true)
    const emitted: unknown[] = []
    fixture.componentInstance.navToggle.subscribe(() => emitted.push(1))
    const toggle = element.querySelector<HTMLButtonElement>('.header__nav-toggle button')
    expect(toggle?.getAttribute('aria-expanded')).toBe('true')
    expect(toggle?.getAttribute('aria-controls')).toBe('side-nav')
    expect(toggle?.getAttribute('aria-label')).toBe('Close navigation')
    toggle?.click()
    expect(emitted.length).toBe(1)
  })

  it('labels the nav toggle Open navigation when closed', async () => {
    const { element } = await render(false)
    const toggle = element.querySelector('.header__nav-toggle button')
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    expect(toggle?.getAttribute('aria-label')).toBe('Open navigation')
  })

  // @i18n-start
  afterEach(() => {
    document.documentElement.setAttribute('dir', 'ltr')
    document.documentElement.setAttribute('lang', 'en')
  })

  it('shows the other language as the toggle and announces the current one', async () => {
    const { element } = await render()
    const toggle = element.querySelector<HTMLButtonElement>('.header__language button')
    expect(toggle?.textContent.trim()).toBe('עברית')
    expect(toggle?.getAttribute('aria-label')).toBe('Switch language to עברית')
    expect(statusText(element)).toContain('Language: English')
  })

  it('switches the language and the direction from the toggle', async () => {
    const { fixture, element } = await render()
    const language = TestBed.inject(LanguageService)
    element.querySelector<HTMLButtonElement>('.header__language button')?.click()
    await vi.waitFor(() => {
      expect(language.lang()).toBe('he')
    })
    await fixture.whenStable()
    expect(document.documentElement.getAttribute('dir')).toBe('rtl')
    const toggle = element.querySelector<HTMLButtonElement>('.header__language button')
    expect(toggle?.textContent.trim()).toBe('English')
    expect(statusText(element)).toContain('שפה: עברית')
  })
  // @i18n-end

  // @pwa-start
  it('shows the install button only once the browser offers an install, and opens the prompt', async () => {
    const { fixture, element } = await render()
    expect(element.querySelector('.header__install')).toBeNull()
    const prompt = vi.fn(() => Promise.resolve())
    const event = new Event('beforeinstallprompt', { cancelable: true })
    Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) })
    window.dispatchEvent(event)
    await fixture.whenStable()
    const install = element.querySelector<HTMLButtonElement>('.header__install button')
    expect(install?.textContent.trim()).toBe('Install app')
    install?.click()
    await vi.waitFor(() => {
      expect(prompt).toHaveBeenCalledOnce()
    })
    await fixture.whenStable()
    expect(element.querySelector('.header__install')).toBeNull()
  })

  it('shows no install hint on a browser that is not iOS Safari', async () => {
    const { element } = await render()
    expect(element.querySelector('.header__hint')).toBeNull()
  })

  it('shows the iOS install hint with a dismiss that keeps it away', async () => {
    localStorage.clear()
    const agent = vi
      .spyOn(window.navigator, 'userAgent', 'get')
      .mockReturnValue(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Safari/604.1',
      )
    const { element, fixture } = await render()
    expect(element.querySelector('.header__hint')).not.toBeNull()
    element.querySelector<HTMLButtonElement>('.header__hint button')?.click()
    await fixture.whenStable()
    expect(element.querySelector('.header__hint')).toBeNull()
    expect(localStorage.getItem('ios-install-hint')).toBe('"1"')
    agent.mockRestore()
    localStorage.clear()
  })
  // @pwa-end

  // @server:auth-start
  describe('with the auth store', () => {
    const logout = vi.fn<() => Promise<boolean>>(() => Promise.resolve(true))
    const user = signal<PublicUser | null>(null)

    async function renderAuth(account: PublicUser | null) {
      logout.mockClear()
      user.set(account)
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          provideTestTranslator(),
          {
            provide: AuthStore,
            useValue: { user, isLoggedIn: () => user() !== null, logout },
          },
        ],
      })
      const fixture = TestBed.createComponent(HeaderComponent)
      await fixture.whenStable()
      return { fixture, element: fixture.nativeElement as HTMLElement }
    }

    const ACCOUNT = { id: '1', email: 'ada@example.com', role: 'user' } as PublicUser

    it('shows a sign-in link to a visitor and no menu', async () => {
      const { element } = await renderAuth(null)
      expect(element.querySelector('.header__sign-in a')?.getAttribute('href')).toBe('/auth/login')
      expect(element.querySelector('.user-menu')).toBeNull()
      expect(element.querySelector('.header__theme')).not.toBeNull()
    })

    it('shows the avatar of a signed-in account, closed, and opens the menu from it', async () => {
      const { fixture, element } = await renderAuth(ACCOUNT)
      expect(element.querySelector('.avatar')?.getAttribute('data-initials')).toBe('AD')
      expect(element.querySelector('.header__sign-in')).toBeNull()
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
      const { fixture, element } = await renderAuth(ACCOUNT)
      element.querySelector<HTMLButtonElement>('.user-menu__trigger button')?.click()
      await fixture.whenStable()
      const buttons = Array.from(element.querySelectorAll<HTMLButtonElement>('#user-menu button'))
      buttons.find((button) => button.textContent.includes('Sign out'))?.click()
      await fixture.whenStable()
      expect(logout).toHaveBeenCalledOnce()
      expect(element.querySelector('#user-menu')).toBeNull()
    })

    it('closes on Escape and gives focus back to the trigger', async () => {
      const { fixture, element } = await renderAuth(ACCOUNT)
      const trigger = element.querySelector<HTMLButtonElement>('.user-menu__trigger button')
      trigger?.click()
      await fixture.whenStable()
      element
        .querySelector('.user-menu')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await fixture.whenStable()
      expect(element.querySelector('#user-menu')).toBeNull()
    })
  })
  // @server:auth-end
})
