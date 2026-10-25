import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Toaster } from 'sonner'

import { NAV } from '@/app/nav'
import { AppShell } from '@/shared/ui/app-shell'

import './globals.css'

export const metadata: Metadata = {
  title: '__PROJECT_NAME__',
  description: '__PROJECT_NAME__',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AppShell name="__PROJECT_NAME__" nav={NAV}>
          {children}
        </AppShell>
        <Toaster richColors />
      </body>
    </html>
  )
}
