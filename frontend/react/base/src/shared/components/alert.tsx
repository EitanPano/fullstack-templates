import type { ComponentProps } from 'react'

import { cn } from '@/shared/utils/cn'

// An icon child (class `icon`) takes the first column; the title and description sit beside it.
export function Alert({
  variant = 'default',
  role = variant === 'destructive' ? 'alert' : 'status',
  className,
  ...props
}: ComponentProps<'div'> & { variant?: 'default' | 'destructive' }) {
  return <div role={role} className={cn('alert', `alert--${variant}`, className)} {...props} />
}

export function AlertTitle({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('alert__title', className)} {...props} />
}

export function AlertDescription({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('alert__description', className)} {...props} />
}
