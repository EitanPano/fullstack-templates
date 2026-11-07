import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { NgComponentOutlet, NgTemplateOutlet } from '@angular/common'
import { ChangeDetectionStrategy, Component, Injector, TemplateRef, inject } from '@angular/core'

import { TranslatePipe } from '../../pipes/translate.pipe'
import { ButtonComponent } from '../button/button.component'
import { IconComponent } from '../icon/icon.component'
import {
  MODAL_DATA,
  MODAL_REF,
  type ModalFrameData,
  type ModalRef,
  type ModalTemplateContext,
} from './modal.tokens'

// The frame every modal shares: a titled header with a close button, and the body the caller's
// component or template renders into. Opened by `ModalService`, never placed in a template. The
// CDK container around it carries role="dialog", aria-modal and the focus trap.
@Component({
  selector: 'app-modal',
  imports: [ButtonComponent, IconComponent, NgComponentOutlet, NgTemplateOutlet, TranslatePipe],
  templateUrl: './modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalComponent {
  private readonly dialogRef = inject(DialogRef)
  protected readonly frame = inject<ModalFrameData>(DIALOG_DATA)

  protected readonly ref: ModalRef<never> = {
    close: (result) => {
      this.dialogRef.close(result)
    },
    closed: this.dialogRef.closed as ModalRef<never>['closed'],
  }

  protected readonly injector = Injector.create({
    parent: inject(Injector),
    providers: [
      { provide: MODAL_REF, useValue: this.ref },
      { provide: MODAL_DATA, useValue: this.frame.data },
    ],
  })

  protected readonly template: TemplateRef<ModalTemplateContext> | null =
    this.frame.content instanceof TemplateRef ? this.frame.content : null
  protected readonly component =
    this.frame.content instanceof TemplateRef ? null : this.frame.content

  protected readonly templateContext: ModalTemplateContext = {
    $implicit: this.frame.data,
    ref: this.ref,
  }

  protected close(): void {
    this.dialogRef.close()
  }
}
