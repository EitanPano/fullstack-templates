// toast.ts belongs: showing one toast in the page's `[data-toast-region]` (toast.astro). A page
// script calls it from a handler after an await, never from an effect that runs on load; the
// message is words from the copy tables, never the server's text.
// It does not belong: the region's markup (toast.astro) or error wording (services/error-copy.ts).
import { UI_COPY } from '../../../models/ui/constant'

export type ToastKind = 'info' | 'success' | 'warning' | 'error'
export const TOAST_DURATION_MS = 5000

// Adds a toast and returns it; an error stays until dismissed, the rest leave after `duration`
// (0 keeps them too). Returns null when the page has no region.
export function showToast(
  message: string,
  kind: ToastKind = 'info',
  duration: number = kind === 'error' ? 0 : TOAST_DURATION_MS,
  root: ParentNode = document,
): HTMLElement | null {
  const region = root.querySelector('[data-toast-region]')
  if (!region) return null

  const toast = document.createElement('div')
  toast.className = `toast toast--${kind}`
  toast.setAttribute('role', kind === 'error' ? 'alert' : 'status')

  const text = document.createElement('p')
  text.className = 'toast__message'
  text.textContent = message

  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'button button--ghost button--icon toast__close'
  close.setAttribute('aria-label', UI_COPY.dismiss)
  close.textContent = '×'

  let timer: ReturnType<typeof setTimeout> | undefined
  const dismiss = () => {
    if (timer !== undefined) clearTimeout(timer)
    toast.remove()
  }
  close.addEventListener('click', dismiss)
  toast.append(text, close)
  region.append(toast)
  if (duration > 0) timer = setTimeout(dismiss, duration)
  return toast
}
