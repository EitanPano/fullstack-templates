import { InjectionToken, type TemplateRef } from '@angular/core'
import type { ComponentType } from '@angular/cdk/portal'
import type { Observable } from 'rxjs'

export type ModalSize = 'sm' | 'md' | 'lg'

// What the caller of `ModalService.open` holds. `closed` emits once, with the result passed to
// `close` (undefined when the user dismissed the dialog with Escape, the backdrop or the X).
export interface ModalRef<R = undefined> {
  close(result?: R): void
  readonly closed: Observable<R | undefined>
}

export interface ModalOptions<D = undefined> {
  readonly titleKey: string
  readonly size?: ModalSize
  // Handed to the content: `inject(MODAL_DATA)` in a component, `let-data` in a template.
  readonly data?: D
}

export type ModalContent = ComponentType<unknown> | TemplateRef<ModalTemplateContext>

// A template opened in a modal gets `let-data` (the options' `data`) and `let-ref="ref"`.
export interface ModalTemplateContext {
  $implicit: unknown
  ref: ModalRef<never>
}

// What a component opened in a modal can inject.
export const MODAL_DATA = new InjectionToken<unknown>('MODAL_DATA')
export const MODAL_REF = new InjectionToken<ModalRef<never>>('MODAL_REF')

// The frame (`app-modal`) reads this from the CDK's DIALOG_DATA.
export interface ModalFrameData {
  readonly titleId: string
  readonly titleKey: string
  readonly content: ModalContent
  readonly data: unknown
}
