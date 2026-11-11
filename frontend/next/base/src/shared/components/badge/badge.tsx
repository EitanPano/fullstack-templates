import type { ComponentProps } from 'react'

import { cn } from '@/shared/utils/cn'
import './badge.scss'

type BadgeProps = ComponentProps<'span'> & {
  variant?: 'default' | 'success' | 'warning' | 'destructive' | 'muted' | 'info'
}

// A status by meaning. Colour alone never carries it: put words or an icon inside.
export function Badge({ variant = 'default', className, ...props }: BadgeProps) {
  return <span className={cn('badge', `badge--${variant}`, className)} {...props} />
}
