import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { STORAGE_KEYS } from '@/core/config/constants'

import { useInstallPromptStore } from './install-prompt.store'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1'

// The browser's install event, mocked: `prompt` opens the dialog, `userChoice` answers it.
function offer(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true })
  const prompt = vi.fn().mockResolvedValue(undefined)
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome }) })
  window.dispatchEvent(event)
  return { event, prompt }
}

describe('useInstallPromptStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('cannot install until the browser offers it', () => {
    const store = useInstallPromptStore()

    expect(store.canInstall).toBe(false)
  })

  it('keeps the offer, holds back the mini-infobar and can install', () => {
    const store = useInstallPromptStore()

    const { event } = offer()

    expect(event.defaultPrevented).toBe(true)
    expect(store.canInstall).toBe(true)
  })

  it('opens the prompt on request, reports the answer and spends the offer', async () => {
    const store = useInstallPromptStore()
    const { prompt } = offer('accepted')

    await expect(store.promptInstall()).resolves.toBe(true)

    expect(prompt).toHaveBeenCalledOnce()
    expect(store.canInstall).toBe(false)
  })

  it('reports a dismissed prompt as not installed', async () => {
    const store = useInstallPromptStore()
    offer('dismissed')

    await expect(store.promptInstall()).resolves.toBe(false)
  })

  it('logs a prompt that throws or a choice that rejects, answers false and spends the offer', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const store = useInstallPromptStore()
    const { event } = offer()
    Object.assign(event, { prompt: vi.fn().mockRejectedValue(new Error('InvalidStateError')) })

    await expect(store.promptInstall()).resolves.toBe(false)

    expect(console.error).toHaveBeenCalledOnce()
    expect(store.canInstall).toBe(false)

    vi.mocked(console.error).mockClear()
    const second = offer()
    Object.assign(second.event, { userChoice: Promise.reject(new Error('gone')) })
    await expect(store.promptInstall()).resolves.toBe(false)
    expect(console.error).toHaveBeenCalledOnce()
  })

  it('answers false and opens nothing when there is no offer', async () => {
    const store = useInstallPromptStore()

    await expect(store.promptInstall()).resolves.toBe(false)
  })

  it('drops the offer once the app is installed', () => {
    const store = useInstallPromptStore()
    offer()

    window.dispatchEvent(new Event('appinstalled'))

    expect(store.canInstall).toBe(false)
  })

  it('shows the hint on iOS Safari, until it is dismissed and remembered', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_SAFARI)
    const store = useInstallPromptStore()
    expect(store.showIosHint).toBe(true)

    store.dismissIosHint()

    expect(store.showIosHint).toBe(false)
    expect(localStorage.getItem(STORAGE_KEYS.iosHint)).toBe('true')
    setActivePinia(createPinia())
    expect(useInstallPromptStore().showIosHint).toBe(false)
  })

  it('shows no hint off iOS, in another iOS browser or once on the home screen', () => {
    expect(useInstallPromptStore().showIosHint).toBe(false)

    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_CHROME)
    setActivePinia(createPinia())
    expect(useInstallPromptStore().showIosHint).toBe(false)

    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_SAFARI)
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })
    setActivePinia(createPinia())
    expect(useInstallPromptStore().showIosHint).toBe(false)
    Reflect.deleteProperty(navigator, 'standalone')
  })
})
