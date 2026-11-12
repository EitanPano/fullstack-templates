import type { ToastKind, ToastParams } from './type'

// An optional button on a toast: `labelKey` is a key of the copy table. A toast with an action
// stays until it is dismissed or the action ran, because the user has a decision to make.
export interface ToastAction {
  labelKey: string
  run: () => void
}

// A toast in the queue. `messageKey` is a key of the copy table, so the text follows the language.
export interface Toast {
  id: number
  kind: ToastKind
  messageKey: string
  params?: ToastParams
  action?: ToastAction
  timeoutMs: number
}
