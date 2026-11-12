import type { IconComponent } from '@/shared/components/icons'
import type { ReactNode } from 'react'

import { cn } from '@/shared/utils/cn'
import './empty-state.scss'

// What a list or section shows when there is nothing to show yet, with the next step.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: IconComponent
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('empty-state', className)}>
      {Icon ? <Icon aria-hidden="true" className="icon icon--lg empty-state__icon" /> : null}
      <h2 className="empty-state__title">{title}</h2>
      {description ? <p className="empty-state__description">{description}</p> : null}
      {action}
    </div>
  )
}
