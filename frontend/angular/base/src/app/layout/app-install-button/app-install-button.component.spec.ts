import { TestBed } from '@angular/core/testing'

import { provideTestTranslator } from '@app/core/i18n/translator.testing'

import { AppInstallButtonComponent } from './app-install-button.component'

describe('AppInstallButtonComponent', () => {
  it('shows the install button only once the browser offers an install, and opens the prompt', async () => {
    TestBed.configureTestingModule({ providers: [provideTestTranslator()] })
    const fixture = TestBed.createComponent(AppInstallButtonComponent)
    const element = fixture.nativeElement as HTMLElement
    await fixture.whenStable()
    expect(element.querySelector('button')).toBeNull()
    const prompt = vi.fn(() => Promise.resolve())
    const event = new Event('beforeinstallprompt', { cancelable: true })
    Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) })
    window.dispatchEvent(event)
    await fixture.whenStable()
    const install = element.querySelector<HTMLButtonElement>('button')
    expect(install?.textContent.trim()).toBe('Install app')
    install?.click()
    await vi.waitFor(() => {
      expect(prompt).toHaveBeenCalledOnce()
    })
    await fixture.whenStable()
    expect(element.querySelector('button')).toBeNull()
  })
})
