import type { BaseSyntheticEvent } from 'react'
import { get } from 'react-hook-form'

// Next signals a redirect or a not-found by throwing an error with a `digest`; the router reads
// it, so a form must not report it. These are Next's own prefixes (its `isNextRouterError`).
const NAVIGATION = ['NEXT_REDIRECT', 'NEXT_NOT_FOUND', 'NEXT_HTTP_ERROR_FALLBACK']

function isNavigationError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('digest' in error)) return false
  const { digest } = error
  return typeof digest === 'string' && NAVIGATION.some((prefix) => digest.startsWith(prefix))
}

// next-safe-action's `executeAsync` rejects with the navigation error of an action that ends in
// `redirect()`, and `<form onSubmit>` drops that promise, so the rejection would go unhandled.
// Wrap the form's `handleSubmitWithAction` in this: a navigation is ignored (the router already
// has it), anything else is rethrown.
export function ignoreNavigation(submit: (event?: BaseSyntheticEvent) => Promise<unknown>) {
  return async (event?: BaseSyntheticEvent): Promise<void> => {
    try {
      await submit(event)
    } catch (error) {
      if (!isNavigationError(error)) throw error
    }
  }
}

type FieldErrors = { _errors?: string[]; [key: string]: unknown }
type Found = { path: string; message: string }

function collect(errors: FieldErrors, path: string, out: Found[]) {
  const message = errors._errors?.[0]
  if (message !== undefined) out.push({ path, message })
  for (const [key, value] of Object.entries(errors)) {
    if (key === '_errors' || typeof value !== 'object' || value === null) continue
    collect(value as FieldErrors, path === '' ? key : `${path}.${key}`, out)
  }
}

// An error the adapter cannot place is invisible: `setError` on a name the form never
// registered shows nothing. When no error sits on a field the form has, return the first message
// (our own copy, from `call`) for a toast; otherwise undefined, because the fields already show them.
export function unplacedMessage(
  validationErrors: unknown,
  isField: (path: string) => boolean,
): string | undefined {
  if (typeof validationErrors !== 'object' || validationErrors === null) return undefined
  const found: Found[] = []
  collect(validationErrors as FieldErrors, '', found)
  if (found.some((entry) => entry.path !== '' && isField(entry.path))) return undefined
  return found[0]?.message
}

// Whether the form registered a field of this name (a binding mounted with it). `_fields` is
// react-hook-form's registry; a name only in the default values, like `next`, has no entry.
export function hasField(form: { control: { _fields: object } }, path: string): boolean {
  return Boolean((get(form.control._fields, path) as { _f?: unknown } | undefined)?._f)
}
