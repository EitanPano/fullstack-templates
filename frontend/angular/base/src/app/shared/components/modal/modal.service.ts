import { Dialog } from '@angular/cdk/dialog'
import { Injectable, inject } from '@angular/core'
import { firstValueFrom } from 'rxjs'

import { uniqueId } from '../../utils/unique-id'
import { ConfirmDialogComponent, type ConfirmData } from './confirm-dialog.component'
import { ModalComponent } from './modal.component'
import type { ModalContent, ModalFrameData, ModalOptions, ModalRef } from './modal.tokens'

export interface ConfirmOptions {
  readonly titleKey: string
  readonly messageKey: string
  // Defaults to `modal.confirm`.
  readonly confirmKey?: string
  // A destructive action: the confirm button is red.
  readonly danger?: boolean
}

// Opens dialogs over the CDK `Dialog`: a panel with role="dialog", aria-modal and aria-labelledby
// pointing at its title, a focus trap, Escape and backdrop to close, and focus handed back to the
// element that opened it. Lives in `shared/` so it depends on the CDK only.
@Injectable({ providedIn: 'root' })
export class ModalService {
  private readonly dialog = inject(Dialog)

  // `content` is a standalone component (it can `inject(MODAL_DATA)` and `inject(MODAL_REF)`) or an
  // `ng-template` (`let-data`, `let-ref="ref"`). `titleKey` is a key of the copy table.
  open<R = undefined, D = undefined>(content: ModalContent, options: ModalOptions<D>): ModalRef<R> {
    const titleId = uniqueId('modal-title')
    const frame: ModalFrameData = {
      titleId,
      titleKey: options.titleKey,
      content,
      data: options.data,
    }
    const size = options.size ?? 'md'
    const ref = this.dialog.open<R, ModalFrameData, ModalComponent>(ModalComponent, {
      data: frame,
      ariaLabelledBy: titleId,
      ariaModal: true,
      maxWidth: '100vw',
      backdropClass: 'modal__backdrop',
      panelClass: ['modal__panel', 'modal__panel--' + size],
    })
    // The backdrop is created by the CDK outside every view, so no sheet can reach it.
    ref.overlayRef.backdropElement?.style.setProperty('background', 'var(--backdrop)')
    return {
      close: (result) => {
        ref.close(result)
      },
      closed: ref.closed,
    }
  }

  // Asks before a destructive or irreversible action; true only when the user chose confirm.
  async confirm(options: ConfirmOptions): Promise<boolean> {
    const data: ConfirmData = {
      messageKey: options.messageKey,
      confirmKey: options.confirmKey ?? 'modal.confirm',
      danger: options.danger ?? false,
    }
    const ref = this.open<boolean, ConfirmData>(ConfirmDialogComponent, {
      titleKey: options.titleKey,
      size: 'sm',
      data,
    })
    return (await firstValueFrom(ref.closed)) === true
  }
}
