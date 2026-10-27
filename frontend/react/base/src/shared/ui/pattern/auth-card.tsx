import type { ReactNode } from 'react'

import { Card, CardContent, CardDescription, CardHeader } from '@/shared/ui/card'

// The centred card of the sign-in and sign-up screens. The title is the page's `h1`: these screens
// have no shell and no PageHeader.
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader>
        <h1 data-slot="card-title" className="text-xl leading-none font-semibold">
          {title}
        </h1>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
