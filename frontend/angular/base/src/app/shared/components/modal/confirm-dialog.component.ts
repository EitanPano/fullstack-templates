import { ChangeDetectionStrategy, Component, inject } from '@angular/core'

import { TranslatePipe } from '../../pipes/translate.pipe'
import { ButtonComponent } from '../button/button.component'
import { MODAL_DATA, MODAL_REF, type ModalRef } from './modal.tokens'

export interface ConfirmData {
  readonly messageKey: string
  readonly confirmKey: string
  readonly danger: boolean
}

// The body of `ModalService.confirm`: a message and a Cancel / Confirm pair. Confirm closes with
// true, Cancel with false.
@Component({
  selector: 'app-confirm-dialog',
  imports: [ButtonComponent, TranslatePipe],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent {
  protected readonly data = inject(MODAL_DATA) as ConfirmData
  private readonly ref = inject(MODAL_REF) as ModalRef<boolean>

  protected answer(confirmed: boolean): void {
    this.ref.close(confirmed)
  }
}
