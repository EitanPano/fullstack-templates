import { DOCUMENT } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core'

import type { Toast, ToastKind } from '@app/models/notification/interface'

import { TranslatePipe } from '../../pipes/translate.pipe'
import { ButtonComponent } from '../button/button.component'
import { IconComponent, type IconName } from '../icon/icon.component'

const ICON: Record<ToastKind, IconName> = {
  success: 'check-circle',
  error: 'alert-circle',
  warning: 'alert-triangle',
  info: 'info',
}

// The panel the notification service puts on the CDK overlay: the queue as a list, each toast with
// a dismiss button. It owns no queue; the service passes it in and hears `dismissed`, and `held`
// (true while the list is hovered or has focus) so it can pause the auto-dismiss timers.
@Component({
  selector: 'app-toast',
  imports: [ButtonComponent, IconComponent, TranslatePipe],
  templateUrl: './toast.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastComponent {
  readonly toasts = input<readonly Toast[]>([])
  readonly dismissed = output<number>()
  readonly held = output<boolean>()

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef)
  private readonly document = inject(DOCUMENT)
  private readonly injector = inject(Injector)
  private hovered = false
  private focused = false
  private lastHeld = false

  constructor() {
    // Dismissing removes the button that had focus, and a removed element fires no focusout, so
    // the flags are recomputed from the DOM after each change of the list.
    effect(() => {
      const empty = this.toasts().length === 0
      untracked(() => {
        if (empty) {
          this.hovered = false
          this.focused = false
          this.report()
          return
        }
        afterNextRender(
          () => {
            const list = this.host.nativeElement.querySelector('.toast-list')
            this.focused = list?.contains(this.document.activeElement) ?? false
            this.report()
          },
          { injector: this.injector },
        )
      })
    })
  }

  // Runs a toast action, then dismisses the toast: the decision is made.
  protected run(id: number, action: () => void): void {
    action()
    this.dismissed.emit(id)
  }

  protected icon(kind: ToastKind): IconName {
    return ICON[kind]
  }

  protected hover(hovered: boolean): void {
    this.hovered = hovered
    this.report()
  }

  protected focus(focused: boolean): void {
    this.focused = focused
    this.report()
  }

  private report(): void {
    const held = this.hovered || this.focused
    if (held === this.lastHeld) return
    this.lastHeld = held
    this.held.emit(held)
  }
}
