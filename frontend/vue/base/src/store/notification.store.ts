import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { Toast, ToastAction, ToastKind, ToastParams } from '@/models/notification/interface'

const TIMEOUT_MS: Record<ToastKind, number> = {
  success: 4000,
  info: 5000,
  warning: 6000,
  error: 8000,
}

// The toast list. A caller passes a key of the copy table (never raw text), so a toast follows
// the language. layout/components/toast-host.vue renders the list through Reka Toast, which owns
// the timers: each toast's `timeoutMs` is its duration, paused while the list is hovered or
// focused (WCAG 2.2.1). Call it from the handler that awaited the work, never from an interceptor.
export const useNotificationStore = defineStore('notification', () => {
  const toasts = ref<Toast[]>([])
  let nextId = 1

  function show(
    kind: ToastKind,
    messageKey: string,
    params?: ToastParams,
    action?: ToastAction,
  ): number {
    const id = nextId++
    toasts.value.push({
      id,
      kind,
      messageKey,
      ...(params ? { params } : {}),
      ...(action ? { action } : {}),
      // A toast with an action never times out: the user has to answer it.
      timeoutMs: action ? 0 : TIMEOUT_MS[kind],
    })
    return id
  }

  const showSuccess = (messageKey: string, params?: ToastParams) =>
    show('success', messageKey, params)
  const showError = (messageKey: string, params?: ToastParams) => show('error', messageKey, params)
  const showInfo = (messageKey: string, params?: ToastParams, action?: ToastAction) =>
    show('info', messageKey, params, action)
  const showWarning = (messageKey: string, params?: ToastParams, action?: ToastAction) =>
    show('warning', messageKey, params, action)

  function dismiss(id: number): void {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  return { toasts, showSuccess, showError, showInfo, showWarning, dismiss }
})
