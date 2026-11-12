import { toast, Toaster as Sonner, type ToasterProps } from 'sonner'
import './toaster.scss'

// The one file that names the toast library (AGENTS.md › Libraries): the toaster the app renders
// once, and the functions the app calls to show a toast. A library switch rewrites this file.

// sonner's toaster with our class; the caller passes the theme choice, because shared/ never
// reads the store. Its look is in toaster.scss.
export function Toaster({ theme }: Pick<ToasterProps, 'theme'>) {
  return <Sonner theme={theme} className="toaster" />
}

// An outcome the person must know about that no field can show.
export function showErrorToast(message: string, description?: string): void {
  toast.error(message, description === undefined ? undefined : { description })
}

export function showSuccessToast(message: string): void {
  toast.success(message)
}

export function showWarningToast(message: string): void {
  toast.warning(message)
}
