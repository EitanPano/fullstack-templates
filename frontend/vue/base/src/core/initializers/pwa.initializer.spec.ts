import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAppUpdateStore } from '@/store/app-update.store'
import { useInstallPromptStore } from '@/store/install-prompt.store'
import { useNotificationStore } from '@/store/notification.store'

import { initPwa } from './pwa.initializer'

const HOUR_MS = 60 * 60 * 1000
const FIVE_MIN_MS = 5 * 60 * 1000
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

vi.mock('virtual:pwa-register/vue', async () => {
  const { ref } = await import('vue')
  return {
    useRegisterSW: () => ({ needRefresh: ref(false), updateServiceWorker: vi.fn() }),
  }
})

describe('initPwa', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('listens for the install prompt from the start, so an early event is not missed', () => {
    initPwa()
    const event = new Event('beforeinstallprompt', { cancelable: true })
    Object.assign(event, { prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'accepted' }) })

    window.dispatchEvent(event)

    expect(useInstallPromptStore().canInstall).toBe(true)
  })

  it('checks for an update every hour', () => {
    const check = vi.spyOn(useAppUpdateStore(), 'check').mockImplementation(() => undefined)
    initPwa()

    vi.advanceTimersByTime(HOUR_MS * 2)

    expect(check).toHaveBeenCalledTimes(2)
  })

  it('checks when the window regains focus, at most every five minutes', () => {
    const check = vi.spyOn(useAppUpdateStore(), 'check').mockImplementation(() => undefined)
    initPwa()

    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('focus'))
    expect(check).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(FIVE_MIN_MS + 1)
    window.dispatchEvent(new Event('focus'))
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('says how to install on iOS Safari, with a dismiss that is remembered', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_SAFARI)

    initPwa()

    const [toast] = useNotificationStore().toasts
    expect(toast).toMatchObject({
      messageKey: 'pwa.iosHint',
      action: { labelKey: 'actions.dismiss' },
    })
    toast?.action?.run()
    expect(useInstallPromptStore().showIosHint).toBe(false)
  })

  it('shows no hint where the browser installs by itself', () => {
    initPwa()

    expect(useNotificationStore().toasts).toEqual([])
  })
})
