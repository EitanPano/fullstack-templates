'use client'

import { useTheme } from 'next-themes'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import './toaster.scss'

// sonner's toaster with our class, themed from next-themes (system until the theme is known).
// Its look is in toaster.scss.
export function Toaster() {
  const { theme = 'system' } = useTheme()
  return <Sonner theme={theme as ToasterProps['theme']} className="toaster" />
}
