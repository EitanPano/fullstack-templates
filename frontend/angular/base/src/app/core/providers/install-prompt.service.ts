import { DOCUMENT } from '@angular/common'
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core'

import { STORAGE_KEYS } from '../config/constants'
import { StorageService } from './storage.service'

// The non-standard event Chromium fires when the app can be installed.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// The install prompt. Chromium offers it once through `beforeinstallprompt`; this keeps the event
// so the header can show an install button and open the prompt on a click. iOS Safari has no such
// event: the user installs through the share sheet, so `showIosHint` tells the header when to say so,
// until the user dismisses it (remembered in local storage).
@Injectable({ providedIn: 'root' })
export class InstallPromptService {
  private readonly win = inject(DOCUMENT).defaultView
  private readonly storage = inject(StorageService)
  private readonly offer = signal<BeforeInstallPromptEvent | null>(null)
  private readonly iosHintDismissed = signal(this.storage.get(STORAGE_KEYS.iosHint) === '1')

  readonly canInstall = computed(() => this.offer() !== null)
  readonly isIos = this.detectIos()
  private readonly iosHintEligible = this.isIos && !this.isStandalone()
  readonly showIosHint = computed(() => this.iosHintEligible && !this.iosHintDismissed())

  constructor() {
    const win = this.win
    if (!win) return
    const onPrompt = (event: Event) => {
      event.preventDefault()
      this.offer.set(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      this.offer.set(null)
    }
    win.addEventListener('beforeinstallprompt', onPrompt)
    win.addEventListener('appinstalled', onInstalled)
    inject(DestroyRef).onDestroy(() => {
      win.removeEventListener('beforeinstallprompt', onPrompt)
      win.removeEventListener('appinstalled', onInstalled)
    })
  }

  // Opens the browser's install prompt and waits for the answer. The event works once, so it is
  // cleared whatever the user chose.
  async promptInstall(): Promise<boolean> {
    const event = this.offer()
    if (!event) return false
    this.offer.set(null)
    await event.prompt()
    const { outcome } = await event.userChoice
    return outcome === 'accepted'
  }

  dismissIosHint(): void {
    this.iosHintDismissed.set(true)
    this.storage.set(STORAGE_KEYS.iosHint, '1')
  }

  private detectIos(): boolean {
    const navigator = this.win?.navigator
    if (!navigator) return false
    const ua = navigator.userAgent
    const ios =
      /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
    // Other iOS browsers cannot add to the home screen the same way; the hint is for Safari.
    return ios && !/crios|fxios|edgios/i.test(ua)
  }

  private isStandalone(): boolean {
    const win = this.win
    if (!win) return false
    const navigator = win.navigator as Navigator & { standalone?: boolean }
    if (navigator.standalone === true) return true
    // jsdom has no matchMedia, so the check stays a runtime one.
    return (
      typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches
    )
  }
}
