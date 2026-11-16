// forms.ts belongs: the framework-free helpers of a page's form script: showing an envelope's
// field errors on the kit's field markup (`[data-field]` around the control and its
// `[data-field-error]` region) and saying the handler is attached. The text shown is the copy
// table's, never the server's. It does not belong: the fetch (services/api.ts) or a form's rules
// (shared/schemas, read through services/validation.ts).
import { FIELD_ERROR_COPY } from '../models/error/constant'
import type { ApiError } from './api'

function control(form: HTMLFormElement, name: string): HTMLElement | null {
  const element = form.elements.namedItem(name)
  return element instanceof HTMLElement ? element : null
}

// Returns false when `name` is no field of the form.
export function showFieldError(form: HTMLFormElement, name: string, message: string): boolean {
  const element = control(form, name)
  const region = element?.closest('[data-field]')?.querySelector('[data-field-error]')
  if (!element || !region) return false
  region.textContent = message
  element.setAttribute('aria-invalid', 'true')
  return true
}

export function clearFieldErrors(form: HTMLFormElement): void {
  for (const region of form.querySelectorAll('[data-field-error]')) region.textContent = ''
  for (const element of form.querySelectorAll('[aria-invalid]')) {
    element.removeAttribute('aria-invalid')
  }
}

// Shows the copy on each field a validation_failed envelope names and returns the paths that name
// no field: the page toasts one message for those, never one for a field that shows its own.
export function applyFieldErrors(form: HTMLFormElement, error: ApiError): string[] {
  clearFieldErrors(form)
  return error.fieldPaths.filter((path) => !showFieldError(form, path, FIELD_ERROR_COPY))
}

// Call once the submit handler is attached: a form submitted before that does a plain GET with its
// fields in the query string. A test waits for `form[data-ready]`.
export function markReady(form: HTMLFormElement): void {
  form.setAttribute('data-ready', 'true')
}
