import { TestBed } from '@angular/core/testing'

import { provideTestTranslator } from '@app/core/i18n/translator.testing'

import { AppInstallHintComponent } from './app-install-hint.component'

async function render() {
  TestBed.configureTestingModule({ providers: [provideTestTranslator()] })
  const fixture = TestBed.createComponent(AppInstallHintComponent)
  await fixture.whenStable()
  return { fixture, element: fixture.nativeElement as HTMLElement }
}

describe('AppInstallHintComponent', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows no hint on a browser that is not iOS Safari', async () => {
    const { element } = await render()
    expect(element.querySelector('.install-hint')).toBeNull()
  })

  it('shows the iOS hint with a dismiss that keeps it away', async () => {
    const agent = vi
      .spyOn(window.navigator, 'userAgent', 'get')
      .mockReturnValue(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Safari/604.1',
      )
    const { element, fixture } = await render()
    expect(element.querySelector('.install-hint')).not.toBeNull()
    element.querySelector<HTMLButtonElement>('.install-hint button')?.click()
    await fixture.whenStable()
    expect(element.querySelector('.install-hint')).toBeNull()
    expect(localStorage.getItem('ios-install-hint')).toBe('"1"')
    agent.mockRestore()
    localStorage.clear()
  })
})
