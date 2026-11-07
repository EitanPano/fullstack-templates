import { Overlay, OverlayRef } from '@angular/cdk/overlay'
import { ComponentPortal } from '@angular/cdk/portal'
import { ComponentRef, DestroyRef, Injectable, inject, signal } from '@angular/core'

import type { Toast, ToastAction, ToastKind, ToastParams } from '@app/models/notification/interface'
import { ToastComponent } from '@app/shared/components/toast/toast.component'

const TIMEOUT_MS: Record<ToastKind, number> = {
  success: 4000,
  info: 5000,
  warning: 6000,
  error: 8000,
}

// The time a toast has left, and the timer counting it down (none while the list is held).
interface Countdown {
  remainingMs: number
  startedAt: number
  timer: ReturnType<typeof setTimeout> | null
}

// The toast queue. A caller passes a key of the copy table (never raw text), so the toast follows
// the language. The queue renders through the toast component on the CDK overlay, created on the
// first toast. Call it from the handler that awaited the work, never from an interceptor.
// Timers pause while the list is hovered or focused (WCAG 2.2.1) and resume afterwards.
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly overlay = inject(Overlay)
  private readonly queue = signal<readonly Toast[]>([])
  private readonly countdowns = new Map<number, Countdown>()
  private held = false
  private nextId = 1
  private overlayRef: OverlayRef | null = null
  private panel: ComponentRef<ToastComponent> | null = null

  readonly toasts = this.queue.asReadonly()

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.countdowns.forEach(({ timer }) => {
        if (timer !== null) clearTimeout(timer)
      })
      this.overlayRef?.dispose()
    })
  }

  showSuccess(messageKey: string, params?: ToastParams): number {
    return this.show('success', messageKey, params)
  }

  showError(messageKey: string, params?: ToastParams): number {
    return this.show('error', messageKey, params)
  }

  showInfo(messageKey: string, params?: ToastParams, action?: ToastAction): number {
    return this.show('info', messageKey, params, action)
  }

  showWarning(messageKey: string, params?: ToastParams, action?: ToastAction): number {
    return this.show('warning', messageKey, params, action)
  }

  dismiss(id: number): void {
    const countdown = this.countdowns.get(id)
    if (countdown?.timer != null) clearTimeout(countdown.timer)
    this.countdowns.delete(id)
    this.queue.update((toasts) => toasts.filter((toast) => toast.id !== id))
    this.render()
  }

  // Holds every countdown while the user reads or acts on the list, then restarts them with the
  // time they had left.
  hold(held: boolean): void {
    if (held === this.held) return
    this.held = held
    const now = Date.now()
    this.countdowns.forEach((countdown, id) => {
      if (held) {
        if (countdown.timer !== null) clearTimeout(countdown.timer)
        countdown.timer = null
        countdown.remainingMs = Math.max(0, countdown.remainingMs - (now - countdown.startedAt))
      } else {
        this.start(id, countdown)
      }
    })
  }

  private show(
    kind: ToastKind,
    messageKey: string,
    params?: ToastParams,
    action?: ToastAction,
  ): number {
    const id = this.nextId++
    // A toast with an action never times out (timeoutMs 0): the user has to answer it.
    const timeoutMs = action ? 0 : TIMEOUT_MS[kind]
    this.queue.update((toasts) => [
      ...toasts,
      {
        id,
        kind,
        messageKey,
        ...(params ? { params } : {}),
        ...(action ? { action } : {}),
        timeoutMs,
      },
    ])
    if (action) {
      this.render()
      return id
    }
    const countdown: Countdown = { remainingMs: timeoutMs, startedAt: Date.now(), timer: null }
    this.countdowns.set(id, countdown)
    if (!this.held) this.start(id, countdown)
    this.render()
    return id
  }

  private start(id: number, countdown: Countdown): void {
    countdown.startedAt = Date.now()
    countdown.timer = setTimeout(() => {
      this.dismiss(id)
    }, countdown.remainingMs)
  }

  // Keeps the panel in step with the queue. The panel stays attached once created, so its live
  // region exists before a toast lands in it and assistive technology announces the arrival.
  private render(): void {
    if (!this.panel) {
      this.overlayRef = this.overlay.create({
        positionStrategy: this.overlay.position().global().bottom().end(),
        panelClass: 'toast-overlay',
      })
      this.panel = this.overlayRef.attach(new ComponentPortal(ToastComponent))
      this.panel.instance.dismissed.subscribe((id) => {
        this.dismiss(id)
      })
      this.panel.instance.held.subscribe((held) => {
        this.hold(held)
      })
    }
    this.panel.setInput('toasts', this.queue())
  }
}
