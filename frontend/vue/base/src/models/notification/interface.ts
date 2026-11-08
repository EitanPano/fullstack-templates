export type ToastKind = 'success' | 'error' | 'info' | 'warning'

export type ToastParams = Record<string, string | number>

// An optional button on a toast: `labelKey` is a key of the copy table. A toast with an action
// stays until it is dismissed or the action ran, because the user has a decision to make.
export type ToastAction = {
  labelKey: string
  run: () => void
}

// A toast in the queue. `messageKey` is a key of the copy table, so the text follows the language.
// `timeoutMs` is how long it stays open; 0 means until the user answers.
export type Toast = {
  id: number
  kind: ToastKind
  messageKey: string
  params?: ToastParams
  action?: ToastAction
  timeoutMs: number
}
