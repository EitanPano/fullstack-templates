import { TestBed } from '@angular/core/testing'

import { InstallPromptService } from './install-prompt.service'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'
const SAFARI = `${IPHONE} Version/18.0 Mobile Safari/604.1`
const CHROME_IOS = `${IPHONE} CriOS/130.0 Mobile Safari/604.1`

function promptEvent(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt', { cancelable: true })
  const prompt = vi.fn(() => Promise.resolve())
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome }) })
  return { event, prompt }
}

describe('InstallPromptService', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(window.navigator, 'standalone')
  })

  it('offers an install after beforeinstallprompt and keeps the browser from showing its own', () => {
    const service = TestBed.inject(InstallPromptService)
    expect(service.canInstall()).toBe(false)
    const { event } = promptEvent('accepted')
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(service.canInstall()).toBe(true)
  })

  it('opens the prompt, reports the choice and clears the offer', async () => {
    const service = TestBed.inject(InstallPromptService)
    const { event, prompt } = promptEvent('accepted')
    window.dispatchEvent(event)
    await expect(service.promptInstall()).resolves.toBe(true)
    expect(prompt).toHaveBeenCalledOnce()
    expect(service.canInstall()).toBe(false)
  })

  it('reports a dismissed prompt as false and still clears the offer', async () => {
    const service = TestBed.inject(InstallPromptService)
    window.dispatchEvent(promptEvent('dismissed').event)
    await expect(service.promptInstall()).resolves.toBe(false)
    expect(service.canInstall()).toBe(false)
  })

  it('has nothing to prompt before the browser offers one', async () => {
    await expect(TestBed.inject(InstallPromptService).promptInstall()).resolves.toBe(false)
  })

  it('resets when the app is installed', () => {
    const service = TestBed.inject(InstallPromptService)
    window.dispatchEvent(promptEvent('accepted').event)
    window.dispatchEvent(new Event('appinstalled'))
    expect(service.canInstall()).toBe(false)
  })

  it('shows the iOS hint in Safari on iOS', () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(SAFARI)
    const service = TestBed.inject(InstallPromptService)
    expect(service.isIos).toBe(true)
    expect(service.showIosHint()).toBe(true)
  })

  it('shows no hint in another iOS browser or once installed to the home screen', () => {
    const agent = vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(CHROME_IOS)
    expect(TestBed.inject(InstallPromptService).showIosHint()).toBe(false)

    TestBed.resetTestingModule()
    agent.mockReturnValue(SAFARI)
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true })
    const installed = TestBed.inject(InstallPromptService)
    expect(installed.isIos).toBe(true)
    expect(installed.showIosHint()).toBe(false)
  })

  it('stays quiet on desktop', () => {
    const service = TestBed.inject(InstallPromptService)
    expect(service.isIos).toBe(false)
    expect(service.showIosHint()).toBe(false)
  })

  it('stays hidden once the user dismissed the iOS hint, across a reload', () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(SAFARI)
    const service = TestBed.inject(InstallPromptService)
    expect(service.showIosHint()).toBe(true)
    service.dismissIosHint()
    expect(service.showIosHint()).toBe(false)

    TestBed.resetTestingModule()
    expect(TestBed.inject(InstallPromptService).showIosHint()).toBe(false)
  })
})
