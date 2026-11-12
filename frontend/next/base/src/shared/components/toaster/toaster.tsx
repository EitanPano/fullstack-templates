'use client'

import { Toaster as Sonner, toast, type ToasterProps } from 'sonner'

import { useAppTheme } from '@/shared/components/theme/theme'

import './toaster.scss'

// The one file that imports the toast library: the toaster, themed with the app's theme (system
// until the theme is known), and the function that shows a toast. Its look is in toaster.scss.
export function Toaster() {
  const { theme = 'system' } = useAppTheme()
  return <Sonner theme={theme as ToasterProps['theme']} className="toaster" />
}

// Shows an error toast. Call it from a Client Component.
export function toastError(message: string) {
  toast.error(message)
}
