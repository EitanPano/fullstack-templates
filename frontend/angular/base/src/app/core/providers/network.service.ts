import { DOCUMENT } from '@angular/common'
import { DestroyRef, Injectable, inject, signal } from '@angular/core'

// Whether the browser reports a connection. It reads navigator.onLine at start and follows the
// window's online and offline events.
@Injectable({ providedIn: 'root' })
export class NetworkService {
  private readonly win = inject(DOCUMENT).defaultView
  private readonly state = signal(this.win?.navigator.onLine ?? true)

  readonly online = this.state.asReadonly()

  constructor() {
    const win = this.win
    if (!win) return
    const goOnline = () => {
      this.state.set(true)
    }
    const goOffline = () => {
      this.state.set(false)
    }
    win.addEventListener('online', goOnline)
    win.addEventListener('offline', goOffline)
    inject(DestroyRef).onDestroy(() => {
      win.removeEventListener('online', goOnline)
      win.removeEventListener('offline', goOffline)
    })
  }
}
