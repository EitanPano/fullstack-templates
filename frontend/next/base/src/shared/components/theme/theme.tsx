'use client'

import { ThemeProvider as Provider, useTheme } from 'next-themes'
import type { ReactNode } from 'react'

// The one file that imports the theme library. The theme is the `data-theme` attribute on <html>
// (set before paint), light, dark or system; `defaultTheme` is what a first visit gets.
export function ThemeProvider({
  defaultTheme,
  children,
}: {
  defaultTheme: string
  children: ReactNode
}) {
  return (
    <Provider attribute="data-theme" defaultTheme={defaultTheme} enableSystem>
      {children}
    </Provider>
  )
}

// The chosen theme (undefined until the provider has mounted) and its setter.
export function useAppTheme() {
  const { theme, setTheme } = useTheme()
  return { theme, setTheme }
}
