import '@fontsource-variable/inter'
import '@/styles/themes/brand.css'
import '@/styles/styles.scss'

import type { Metadata } from 'next'
import { ThemeProvider } from 'next-themes'
import type { ReactNode } from 'react'

import { Toaster } from '@/shared/components/toaster'
import { TooltipProvider } from '@/shared/components/tooltip'

export const metadata: Metadata = {
  title: { template: '%s · __PROJECT_DISPLAY_NAME__', default: '__PROJECT_DISPLAY_NAME__' },
  description: '__PROJECT_DISPLAY_NAME__',
}

// The document, the theme and the providers every route needs. The page frame is the route
// group's layout, so a screen without chrome (sign-in) can live in a group of its own. This is
// the one file that loads the global style tree.
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // next-themes sets `data-theme` on <html> before paint, so the attribute differs from the
    // server markup by design.
    <html lang="en" data-density="__THEME_DENSITY__" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="data-theme" defaultTheme="__THEME_DEFAULT__" enableSystem>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
