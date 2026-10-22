import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Toaster } from 'sonner'

import './globals.css'

export const metadata: Metadata = {
  title: '__PROJECT_NAME__',
  description: '__PROJECT_NAME__',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <Toaster richColors />
      </body>
    </html>
  )
}
