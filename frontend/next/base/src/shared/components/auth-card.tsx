import type { ReactNode } from 'react'

import { Card, CardContent, CardDescription, CardHeader } from '@/shared/components/card'
import { cn } from '@/shared/utils/cn'
import './auth-card.scss'

// The centred card of the sign-in and sign-up screens. The title is the page's `h1`: these screens
// have no shell and no PageHeader.
export function AuthCard({
  title,
  description,
  className,
  children,
}: {
  title: string
  description?: string
  className?: string
  children: ReactNode
}) {
  return (
    <Card className={cn('auth-card', className)}>
      <CardHeader>
        <h1 className="card__title auth-card__title">{title}</h1>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
